
let currentEditIndex = null; // Track the index of the currently editing redirect

// popup.js
// Attach event listener to the entire popup
document.querySelector('.popup-box').addEventListener('click', handlePopupClick);
function handlePopupClick(event) {
    document.getElementById("status").textContent = "";
}

// Load initial values from storage on popup open
document.addEventListener("DOMContentLoaded", async function () {
    await realTimeEditformSync()
    const headerBox = document.querySelector('.header-box');
    const toggle = headerBox.querySelector('.enable-toggle');
    const switchText = headerBox.querySelector('.switch-text');

    chrome.storage.local.get('onOff', (result) => {
        const onOffState = result.onOff ? result.onOff[0] : 'OFF';
        toggle.checked = onOffState === 'ON';
        switchText.textContent = onOffState;
    });
    checkForUpdate()
})

document.getElementById('disableAllBtn').addEventListener('click', disableEnableAllRedirects);

async function realTimeEditformSync() {
    chrome.storage.local.get("tempString", function (data) {
        if (data.tempString) {
            currentEditIndex = data.tempString.edit;
            const buttonIndex = currentEditIndex;
            const deleteButtons = document.querySelectorAll(".delete-btn");
            if (deleteButtons[buttonIndex]) {
                deleteButtons[buttonIndex].disabled = true;
            }

            document.getElementById("fromUrl").value = data.tempString.from;
            document.getElementById("toUrl").value = data.tempString.to;
            document.getElementById("methodSelect").value = data.tempString.method;

        }
    });
}

// Listen for input events and save to storage
document.getElementById("fromUrl").addEventListener("input", function () {
    const fromUrlValue = this.value;
    chrome.storage.local.get("tempString", function (data) {
        const tempString = data.tempString;
        tempString.from = fromUrlValue; // Update the 'from' value
        chrome.storage.local.set({ tempString: tempString }); // Save updated object
    });
});

document.getElementById("methodSelect").addEventListener("input", function () {
    const method = this.value;
    chrome.storage.local.get("tempString", function (data) {
        const tempString = data.tempString;
        tempString.method = method; // Update the 'from' value
        chrome.storage.local.set({ tempString: tempString }); // Save updated object
    });
});

document.getElementById("toUrl").addEventListener("input", function () {
    const toUrlValue = this.value;
    chrome.storage.local.get("tempString", function (data) {
        const tempString = data.tempString;
        tempString.to = toUrlValue; // Update the 'to' value
        chrome.storage.local.set({ tempString: tempString }); // Save updated object
    });
});

// Event listener for adding/updating a redirect
document.getElementById("addRedirect").addEventListener("click", function (event) {
    event.stopPropagation(event);

    const fromUrl = document.getElementById("fromUrl").value.trim();
    const toUrl = document.getElementById("toUrl").value.trim();


    if (!isValidUrl(fromUrl) || !isValidUrl(toUrl)) {
        document.getElementById("status").textContent = "Please enter valid URLs.";
        document.getElementById("status").style.color = "red";
        return; // Exit the function if the URLs are not valid
    }
    if(!isValidHostname(fromUrl)|| !isValidHostname(toUrl)){
        document.getElementById("status").textContent = "URLs must contain a hostname";
        document.getElementById("status").style.color = "red";
        return; 
    }

    if (fromUrl == toUrl) {
        document.getElementById("status").textContent = "Please enter distinct URLs.";
        document.getElementById("status").style.color = "red";
        return;
    }
    if (!hasSameNumberOfHashes(fromUrl, toUrl)) {
        document.getElementById("status").textContent = "Placeholder # must be same in both URLs. ";
        document.getElementById("status").style.color = "red";
        return;
    }


    const methodSelect = document.getElementById("methodSelect");
    const method = methodSelect.options[methodSelect.selectedIndex].value;

    const loadingIndicator = document.getElementById("loading");
    loadingIndicator.style.display = "block";

    if (fromUrl && toUrl) {
        // Get current redirects and methods from storage
        chrome.storage.local.get(["redirects", "methods", "onOff"], function (data) {
            const redirects = data.redirects || [];
            let onOff = data.onOff ? data.onOff[0] : "OFF";
            if (!currentEditIndex && redirects.find(e => e.from === fromUrl && e.method == method)) {
                document.getElementById("status").textContent = "Redirect already exists";
                document.getElementById("status").style.color = "red";
                loadingIndicator.style.display = "none";
                return;
            }

            const ruleId = currentEditIndex
                ? redirects[currentEditIndex]?.redirectRuleId || 1
                : redirects.length
                    ? Math.max(...redirects.map(e => e.redirectRuleId)) + 2
                    : 1;

            const currentTimestamp = new Date().toISOString();

            if (currentEditIndex !== null) {
                // Update existing redirect
                const updatedRedirect = {
                    from: fromUrl,
                    to: toUrl,
                    enabled: true,
                    method: method,
                    redirectRuleId: ruleId,
                    timestamp: currentTimestamp // Update timestamp
                };

                // Remove the edited redirect from its current position
                redirects.splice(currentEditIndex, 1);

                // Add the updated redirect to the top
                redirects.unshift(updatedRedirect);

                document.getElementById("status").textContent = "Redirect updated successfully";
                document.getElementById("status").style.color = "green";
                currentEditIndex = null; // Reset edit index
            }
            // Add new redirect to the top
            else {
                redirects.unshift({
                    from: fromUrl,
                    to: toUrl,
                    enabled: true,
                    method: method,
                    redirectRuleId: ruleId,
                    timestamp: currentTimestamp // Set timestamp
                });
                document.getElementById("status").textContent = "Redirect added successfully";
                document.getElementById("status").style.color = "green";
            }

            // Save updated redirects and methods to storage
            chrome.storage.local.set({ redirects: redirects }, function () {
                document.getElementById("fromUrl").value = ""; // Clear input field
                document.getElementById("toUrl").value = ""; // Clear input field
                document.getElementById("methodSelect").value = "GET";
                updateRedirectList(); // Refresh the list
            });
            resetTempString()
            if (onOff == 'ON') {
                updateRedirectRule({ fromUrl, toUrl, id: ruleId, method }, () => { loadingIndicator.style.display = "none"; })
            } else {
                loadingIndicator.style.display = "none";
            }
            // const deleteButton = document.getElementById("redirectList").querySelector(`.delete-btn[data-index="${currentEditIndex}"]`);
            reEnableDisableDeleteButton(true);
            reEnableDisableEditButton(true);
        });
    }
    else {
        document.getElementById("status").textContent = "Please enter both URLs.";
        document.getElementById("status").style.color = "red";
    }
});

// Function to update the current redirects list in the UI
async function updateRedirectList() {
    chrome.storage.local.get(["redirects"], function (data) {
        let redirects = data.redirects || [];
        // Sort redirects based on the timestamp
        redirects.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const redirectList = document.getElementById("redirectList");
        redirectList.innerHTML = ""; // Clear existing list
        const totalRules = redirects?.length || 0;
        let totalEnabledRules = 0;
        redirects.forEach((redirect, index) => {
            const method = redirect.method || 'GET'; // Default method to GET if undefined
            totalEnabledRules = totalEnabledRules + (redirect.enabled ? 1 : 0);
            const li = document.createElement("li");
            li.innerHTML = `
            <div class="redirect-item">
            <strong class="small-input">Method:</strong> 
            <span class="small-input">${method}</span><br>
            
            <strong class="small-input">From:</strong> 
            <span class="small-input">${redirect.from}</span><br>
            
            <strong class="small-input">To&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</strong> 
            <span class="small-input">${redirect.to}</span><br>
            
                <div class="action-container">
                    <label class="switch">
                        <input type="checkbox" class="enable-toggle" ${redirect.enabled ? 'checked' : ''} data-index="${index}">
                        <span class="slider round">
                            <span class="switch-text">${redirect.enabled ? 'ON' : 'OFF'}</span>
                        </span>
                    </label>
                    <button class="edit-btn" data-index="${index}">Edit</button>
                    <button class="delete-btn" data-index="${index}">Delete</button>
                </div>
                <hr>
                </div>
            `;
            redirectList.appendChild(li);

            setlengthOfUnderline(redirects)

            // Update toggle text dynamically
            const checkbox = li.querySelector('.enable-toggle');
            const switchText = li.querySelector('.switch-text');
            checkbox.addEventListener('change', (event) => {
                switchText.textContent = checkbox.checked ? 'ON' : 'OFF';
                handleEnableToggle(event);
            });

            // Add event listener to the edit button
            // Enable the corresponding delete button when the edit button is clicked
            const editButton = li.querySelector(".edit-btn");
            const deleteButton = li.querySelector(".delete-btn");
            editButton.addEventListener("click", () => {
                reEnableDisableDeleteButton(false, deleteButton);
                reEnableDisableEditButton(false, editButton);
            });
        });

        //manupulate all disable button
        document.getElementById('disableAllBtn').innerText = (totalEnabledRules == totalRules) ? 'Disable All' : 'Enable All';
        // document.getElementById('disableAllBtn').style.backgroundColor = (totalEnabledRules == totalRules) ? '#e25131' : 'green'; // Example: Blue


        // Add event listeners for Edit and Delete buttons
        document.querySelectorAll(".edit-btn").forEach(button => {
            button.addEventListener("click", handleEdit);
        });

        document.querySelectorAll(".delete-btn").forEach(button => {
            button.addEventListener("click", handleDelete);
        });
        adjustRedirectListHeight();
    });
    realTimeEditformSync();
}

// Handle the enable toggle functionality
function handleEnableToggle(event) {
    const index = event.target.dataset.index;
    const loadingIndicator = document.getElementById("loading"); // Get the loading indicator element
    loadingIndicator.style.display = "block"; // Show loading indicator

    chrome.storage.local.get(["redirects", "onOff"], function (data) {
        const redirects = data.redirects || [];
        const onOff = data.onOff ? data.onOff[0] : 'OFF';

        redirects[index].enabled = event.target.checked;
        const redirect = redirects[index]
        chrome.storage.local.set({ redirects: redirects }, async function () {
            await updateRedirectList(); // Refresh the list to show updated status
            loadingIndicator.style.display = "none";
        });
        //add or delete  redirect rules 
        if (event.target.checked && onOff == 'ON') {
            updateRedirectRule({ fromUrl: redirect.from, toUrl: redirect.to, id: redirect.redirectRuleId, method: redirect.method },
                (success) => {
                    loadingIndicator.style.display = "none";
                });
        } else {
            removeRedirectRule(redirect.redirectRuleId, () => { loadingIndicator.style.display = "none"; });
        }
    });
    reEnableDisableDeleteButton(false);
}


// Handle edit button click
async function handleEdit(event) {
    const container = document.querySelector('.redirect-container');
    container.style.display = 'block';
    const button = document.querySelector('#toggleButton');
    button.textContent = '~';
    button.style.backgroundColor = button.textContent == '~' ? 'rgb(211, 64, 66)' : 'rgb(241, 237, 6)';

    const index = event.target.dataset.index;
    chrome.storage.local.get("redirects", function (data) {
        const redirects = data.redirects || [];
        const redirect = redirects[index];

        // Populate the input fields with the redirect data for editing
        document.getElementById("fromUrl").value = redirect.from;
        document.getElementById("toUrl").value = redirect.to;
        document.getElementById("methodSelect").value = redirect.method;

        chrome.storage.local.set({ tempString: { from: redirect.from, to: redirect.to, method: redirect.method, edit: index } }, function () { });
        currentEditIndex = index;
        realTimeEditformSync();
    });
}

// Handle delete button click
function handleDelete(event) {
    const index = event.target.dataset.index;

    const loadingIndicator = document.getElementById("loading"); // Get the loading indicator element
    loadingIndicator.style.display = "block"; // Show loading indicator

    chrome.storage.local.get(["redirects", "methods", "tempString"], function (data) {
        const redirects = data.redirects || [];
        const ruleId = redirects[index]?.redirectRuleId;
        const tempString = data.tempString || {};
        const editeIndex = tempString?.edit;
        tempString.edit = editeIndex > index ? editeIndex - 1 : editeIndex;
        // Remove the selected redirect and its method
        redirects.splice(index, 1);

        // Save the updated lists to storage
        chrome.storage.local.set({ redirects: redirects, tempString: tempString }, function () {
            updateRedirectList(); // Refresh the list
        });
        //delete from rules 
        removeRedirectRule(ruleId, () => { loadingIndicator.style.display = "none"; })

    });
}

function reEnableDisableDeleteButton(flag, deleteButton) {
    const deleteButtons = document.querySelectorAll(".delete-btn");
    deleteButtons.forEach(button => {
        button.disabled = false; // Enable each button
    });
    if (!flag && deleteButton) {
        deleteButton.disabled = true;
    }
}

function reEnableDisableEditButton(flag, editButton) {
    const editButtons = document.querySelectorAll(".edit-btn");
    editButtons.forEach(button => {
        button.disabled = false; // Enable each button
    });
    if (!flag && editButton) {
        editButton.disabled = true;
    }
}

async function updateRedirectRule({ fromUrl, toUrl, id, method }, callback) {

    const ruleId = parseInt(id, 10); // Parse the id as an integer

    let domainName = new URL(fromUrl);
    domainName = domainName.hostname.toLowerCase();
    const specialChars = /[.*+?^${}()/|[\]\\]/g;
    fromUrl = fromUrl.replace(specialChars, '\\$&')
    fromUrl = fromUrl.replace(/#+/g, '(.+)');
    fromUrl = '^' + fromUrl + '$';

    let headerRedirectUrl = toUrl;
    headerRedirectUrl = headerRedirectUrl.replace(specialChars, '\\$&')
    headerRedirectUrl = headerRedirectUrl.replace(/#+/g, '(.+)');
    headerRedirectUrl = '^' + headerRedirectUrl + '$';


    let count = 1;
    toUrl = toUrl.replace(/#+/g, '#');
    toUrl = toUrl.replace(/#/g, () => `\\${count++}`);

    // Create the new redirect rule
    const redirectRule = {
        id: ruleId,
        priority: ruleId,
        action: {
            type: "redirect",
            redirect: {
                regexSubstitution: toUrl
            }
        },
        condition: {
            regexFilter: fromUrl,
            requestMethods: [method.toLowerCase()], // Check for the specified method (e.g., POST)
            resourceTypes: ["xmlhttprequest"] // Main frame request, can be changed as needed
        }
    };

    //get the token for domine from storage
    const heders = await getToken(domainName);
    setDomainArr(domainName);

    // Create the new modify headers rule
    const modifyHeadersRule = {
        id: ruleId + 1, // Use a unique ID different from the redirect rule
        priority: ruleId + 1, // Set priority higher than the redirect rule
        action: {
            type: "modifyHeaders",
            requestHeaders: heders.map(header => ({
                header: header.name,
                value: header.value,
                operation: "set"
              }))
        },
        condition: {
            regexFilter: headerRedirectUrl, // Matches the redirected URL pattern
            requestMethods: [method.toLowerCase()], // Check for the specified method (e.g., POST)
            resourceTypes: ["xmlhttprequest"] // Target API requests
        }
    };

    // Update the dynamic rules in your background script
    await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [redirectRule, modifyHeadersRule], // Add the new rule
        removeRuleIds: [ruleId, ruleId + 1] // Remove old rules if any, using the integer ID
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error updating rules:", chrome.runtime.lastError);
            callback(false); // Indicate failure
        } else {
            console.log("Redirect rules updated successfully.");
            callback(true); // Indicate failure
        }
    });
}


async function setDomainArr(domain) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(["allDomines"], function(result) {
        let existingDomains = result.allDomines || []; 
        if(existingDomains.includes(domain)) return;
        existingDomains.push(domain);
        chrome.storage.local.set({ "allDomines": existingDomains }, function() {
          console.log("Updated domains:", existingDomains);
          resolve(existingDomains); 
        });
      });
    });
  }
  
async function getToken(domainName) {
    return new Promise((resolve) => {
        chrome.storage.local.get([domainName], (result) => {
            console.log('get Headers:', result[domainName]);
            resolve(
                result[domainName] || [
                    {
                        name: "Authorization",
                        value: ""
                    }
                ]
            );
        });
    });
}


async function getDomainModifyHeadersRule(targetDomain) {
    return new Promise((resolve, reject) => {
        chrome.declarativeNetRequest.getDynamicRules((allRules) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            const domainRules = allRules.filter(
                (rule) =>
                    rule?.action?.type === "modifyHeaders" &&
                    rule?.condition?.urlFilter === targetDomain
            );

            resolve(domainRules);
        });
    });
}
  

function removeRedirectRule(ruleId, callback) {
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId, ruleId+1]
    }, () => {
        if (chrome.runtime.lastError) {
            console.log("Error removing dynamic rule:", chrome.runtime.lastError);
            callback(false);
        } else {
            console.log(`Redirect rule with id ${ruleId} removed from dynamic rules.`);
            callback(true);
        }
    });
}

function isValidUrl(url) {
    try {
        const url2 = new URL(url);
        return !!url2.href; // Ensure the URL is valid
    } catch {
        return false; // Return false if an error is thrown
    }
}

function isValidHostname(url) {
    try {
        const url2 = new URL(url);
        return !!url2.hostname; // Ensure the hostname is valid
    } catch {
        return false; // Return false if an error is thrown
    }
}




function resetTempString() {
    currentEditIndex = null;
    chrome.storage.local.set({ tempString: { from: "", to: "", method: "GET", edit: null } }, function () { });
}

function hasSameNumberOfHashes(str1, str2) {
    const countHashes = str => (str.match(/#/g) || []).length;
    return countHashes(str1) === countHashes(str2);
}

async function updateHeaderToggle() {
    document.querySelectorAll(".header-box").forEach(headerBox => {

        headerBox.addEventListener("input", async function () {
            const toggle = headerBox.querySelector('.enable-toggle');
            const switchText = headerBox.querySelector('.switch-text');

            if (!toggle.hasEventListener) {
                toggle.addEventListener('change', async () => {

                    switchText.textContent = toggle.checked ? "ON" : "OFF";

                    chrome.storage.local.get('redirects', async (result) => {
                        const currentRedirects = result.redirects || [];
                        const switchTextValue = switchText ? switchText.textContent : 'OFF';

                        chrome.storage.local.set(
                            {
                                redirects: currentRedirects,
                                onOff: [switchTextValue]
                            });
                    })
                    await updateRulesBasedOnOnOFF(switchText.textContent)
                });
                toggle.hasEventListener = true;
            }
        });
    });
}

async function updateRulesBasedOnOnOFF(state, source) {
    try {
        if (state === 'OFF') {
            chrome.declarativeNetRequest.getDynamicRules((rules) => {
                const ruleIds = rules.map(rule => rule.id);
                chrome.declarativeNetRequest.updateDynamicRules(
                    {
                        addRules: [],
                        removeRuleIds: ruleIds
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.error(`Error removing rules: ${chrome.runtime.lastError.message}`);
                        } else {
                            console.log('All dynamic rules removed successfully.');
                        }
                    });
            });
        }
        else if (state === 'ON') {
            await chrome.storage.local.get(["redirects"], async function (data) {
                let redirects = data.redirects || [];
                redirects = redirects.filter(r => r.enabled === true);
                for (let redirect of redirects) {
                    const loadingIndicator = document.getElementById("loading");
                    loadingIndicator.style.display = "block";
                    await updateRedirectRule({ fromUrl: redirect.from, toUrl: redirect.to, id: redirect.redirectRuleId, method: redirect.method },
                        () => { loadingIndicator.style.display = "none"; });
                }
            });
        }
    } catch (err) {
        console.error(err);
    }
}

async function disableEnableAllRedirects() {
    //const button =  document.getElementById('disableAllBtn');
    let btn = document.getElementById('disableAllBtn').innerText;

    await chrome.storage.local.get(['redirects', 'onOff'], async (result) => {
        let redirects = result.redirects || [];
        let onOff = result.onOff || ['OFF']
        redirects.forEach(r => r.enabled = btn !== 'Enable All' ? false : true);
        await chrome.storage.local.set(
            {
                redirects: redirects,
                onOff: onOff
            });
        updateRulesBasedOnOnOFF(btn !== 'Enable All' || onOff[0] == 'OFF' ? 'OFF' : 'ON')
        updateRedirectList();
    })

}

document.getElementById('toggleButton').addEventListener('click', async function () {
    const container = document.querySelector('.redirect-container');
    const isVisible = container.style.display === 'block';
    if (this.textContent == '~') {
        resetTempString();
        document.getElementById("fromUrl").value = ''; // Set saved value for 'from'
        document.getElementById("toUrl").value = ''; // Set saved value for 'to'
        document.getElementById("methodSelect").value = 'GET';
        reEnableDisableDeleteButton(false);
    }
    
    container.style.display = isVisible ? 'none' : 'block';
    this.textContent = isVisible ? '+' : '~';
    this.style.backgroundColor = this.textContent == '~' ? 'rgb(211, 64, 66)' : 'rgb(241, 237, 6)';

    // Adjust the height of #redirectList based on collapsible div height
    adjustRedirectListHeight();
    updateRedirectList();
});

function adjustRedirectListHeight() {
    const container = document.querySelector('.redirect-container');
    const isVisible = container.style.display === 'block';
    let collapsibleDivHeight = '0';
    if (isVisible) {
        collapsibleDivHeight = document.querySelector('.redirect-container').offsetHeight + 100;
    } else {
        collapsibleDivHeight = `98`;
    }
    const redirectList = document.getElementById("redirectList");
    redirectList.style.height = `calc(100vh - ${collapsibleDivHeight}px)`;
}

function updateRedirectContainer() {
    const container = document.querySelector('.redirect-container');
    const button = document.querySelector('#toggleButton');
    chrome.storage.local.get("tempString", function (data) {
        if (data.tempString && (data.tempString.from || data.tempString.to)) {
            container.style.display = 'block';
            button.textContent = '~';
            button.style.backgroundColor = 'rgb(211, 64, 66)';
        } else {
            container.style.display = 'none';
            button.textContent = '+';
            button.style.backgroundColor = 'rgb(241, 237, 6)';
        }
    });
}

function setlengthOfUnderline(redirects) {
    let width = '105%';
    let maxchar = 60;
    redirects.forEach(e => {
        let maxurl = e.from.length < e.to.length ? e.to.length : e.from.length
        if (maxurl > maxchar) {
            maxchar = maxurl;
        }
    })
    let mul = maxchar == 60 ? 1.75 : 1.6;
    width = maxchar * mul
    width = width + '%';
    const elements = document.querySelectorAll('hr');
    elements.forEach(element => {
        element.style.width = width;
    });
}

async function checkForUpdate() {
    chrome.storage.local.get("lastUpdateDate", async function (localdata) {
        const fileUrl = "https://raw.githubusercontent.com/svfodekar/confg/main/ApiRedirectorConfg.json";
        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("config JSON data:", data);

            const lastUpdateTime = localdata.lastUpdateDate;
            console.log(localdata, Date.now() - lastUpdateTime, data.frequencyInSec * 1000);
            if ((Date.now() - lastUpdateTime) < (data.frequencyInSec * 1000)) return;
            chrome.storage.local.set({ lastUpdateDate: Date.now() });

            const manifest = chrome.runtime.getManifest();
            console.log(manifest?.version, data?.version)
            if (manifest?.version < data?.version) {
                updateShowPopup(data.message, 'update', (data?.timeInSec * 1000), data?.heightOffset)
            }
            else if (data?.feedback && data?.feedbackMessage) {
                updateShowPopup(data.feedbackMessage, 'update', (data?.timeInSec * 1000), data?.heightOffset)
            }

        } catch (error) {
            console.error("Error while setting status popup:", error);
        }
    });
}

function updateShowPopup(message, type, time, heightOffset = null) {
    // Create popup container dynamically
    const popup = document.createElement('div');
    popup.classList.add('updatepopup');

    // Add message content to the popup
    const messageSpan = document.createElement('span');
    messageSpan.innerHTML = message;
    popup.appendChild(messageSpan);
    // Create and append the close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'x';
    closeBtn.classList.add('updateclose-btn');
    closeBtn.addEventListener('click', () => {
        popup.style.display = 'none';
    });
    popup.appendChild(closeBtn);
    // Apply the appropriate class based on update status
    if (type === 'update') {
        popup.classList.add('update');
    }
    document.body.appendChild(popup);
    popup.style.display = 'block';

    const popupElement = document.querySelector('.updatepopup')
    popupElement.style.bottom = heightOffset ? heightOffset : '20px';

    if (time) {
        setTimeout(() => {
            popup.style.display = 'none'; // Hide after 5 seconds
        }, time);
    }
}

  

// Initial call to populate the list of available redirects and main toggle state
updateRedirectContainer()
updateHeaderToggle()
updateRedirectList();
