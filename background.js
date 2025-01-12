chrome.runtime.onInstalled.addListener((info) => {
  if (info.reason === "install") {
    firstTimeSetup();
  }
});

function firstTimeSetup() {
  chrome.storage.local.get('redirects', function (data) {
    if (chrome.runtime.lastError) {
      console.error("Error accessing storage:", chrome.runtime.lastError);
    } else if (!data.redirects) {
      // Initialize storage only if it doesn't already exist
      chrome.storage.local.set({
        redirects: [
          {
            from: "https://redirect-example.com/something",
            to: "https://desired-url.com/something/more",
            enabled: false,
            method: 'GET',
            redirectRuleId: 1
          },
          {
            from: "https://redirect-to-local-server-example.com/something",
            to: "https://localhost:3000/something",
            enabled: false,
            method: 'POST',
            redirectRuleId: 2
          },
          {
            from: "https://redirect-multiple-apis-example.com/#",
            to: "http://localhost:3000/#",
            enabled: false,
            method: 'GET',
            redirectRuleId: 3
          },
          {
            from: "https://placeholder-params-example.com/project/#/tasks?Name=#&number=#",
            to: "https://localhost:3000/project/#/tasks?Name=#&number=#",
            enabled: false,
            method: 'DELETE',
            redirectRuleId: 4
          },
          {
            from: "https://placeholder-as-regex-example.com/#something/task",
            to: "http://localhost:3000/#something/task",
            enabled: false,
            method: 'GET',
            redirectRuleId: 5
          },
        ],
        onOff: ['OFF']
      }, function () {
        //console.log("Initial dummy redirect data stored.");
      });
    } else {
      //console.log("Redirect data already exist and initialized.");
    }
  });

  chrome.storage.local.set({ tempString: { from: "", to: "", method: "GET", edit: null }, lastUpdateDate: null }, function () {
    //console.log("Temporary storage initialized.");
  });
  // Get all current dynamic rules and remove them
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    const ruleIds = rules.map(rule => rule.id); // Collect all rule IDs

    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [], // No rules added initially
      removeRuleIds: ruleIds // Remove all currently applied dynamic rules
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error clearing dynamic rules on install:", chrome.runtime.lastError);
      } else {
        //console.log("All dynamic rules removed on install.");
      }
    });
  });
}

// Listen to every request and store headers if it hits a specific domain
async function listenToRequestsAndStoreHeaders() {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    async function (details) {
      if (details.method.toLowerCase() !== 'get') return;
      let targetDomains = await getDomainArr();
      targetDomains = await getLatestDomains(targetDomains)
      setDomainArr(targetDomains);
      // console.log("Target domains:", targetDomains, "Req :",  details)
      for (let targetDomain of targetDomains) {
        let upcomingDomain = (new URL(details.url)).hostname.toLowerCase();
        //console.log("Upcoming domain:", upcomingDomain, targetDomain)
        if ((upcomingDomain.includes(targetDomain))) {
          showWarningPopupLogic(details);
          const tokenHeaders = ['authorization', 'token', 'jwt', 'cookie'];
          const authHedArr = details.requestHeaders.filter(o => tokenHeaders.some(keyword => (o.name.toLowerCase()).includes(keyword)))
          //console.log("upcoming headers : ", authHedArr)
          if (authHedArr.length < 1) {
            //console.log("No upcoming headers hence doing nothing ");
            return;
          }
          await chrome.storage.local.set({ [targetDomain]: authHedArr }, function () {
          //  console.log(`Headers for ${details.url} stored successfully`, authHedArr);
          });

          const rules = await getDomainModifyHeadersRule(targetDomain);
          //console.log("getDomainModifyHeadersRule: ", rules)
          for (let rule of rules) {
            rule.action.requestHeaders = authHedArr.map(header => ({
              header: header.name,
              value: header.value,
              operation: "set"
            }))
            await chrome.declarativeNetRequest.updateDynamicRules({
              addRules: [rule],
              removeRuleIds: [rule.id]
            }, () => {
              //console.log('Dynamic rule updated with new headers for', rule);
            });
          }
        }
      }
    },
    {
      urls: ['<all_urls>'],
      types: ['xmlhttprequest'] // Listen to only XMLHttpRequest (XHR) requests

    }, // Listen to all URLs

    ['requestHeaders'] // Include the request headers in the callback
  );

}

async function showWarningPopupLogic(details){
  const isEnabled = await getAppOnOffState();
  //console.log("App isEnabled: " + isEnabled);
  if (isEnabled == 'ON') {
    if (details.tabId && details.tabId >= 0) {
      //console.log("Request associated with a valid tab.");
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        func: displayExtensionMessage,
      });
    } else {
      //console.log("Request not associated with a valid tab.");
    }
  }
}

async function getDomainArr(domain) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["allDomines"], (result) => {
      resolve(result.allDomines || []);
    });
  });
}

async function getAppOnOffState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["onOff"], (result) => {
      resolve(result.onOff[0] || 'OFF');
    });
  });
}

async function setDomainArr(updatedDomains) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ allDomines: updatedDomains }, () => {
      //console.log("Domains updated successfully:", updatedDomains);
      resolve(updatedDomains);
    });
  });
}


async function getDomainModifyHeadersRule(targetDomain) {
  return new Promise((resolve) => {
    chrome.declarativeNetRequest.getDynamicRules((allRules) => {
      //console.log("getDomainModifyHeadersRule allrules:", allRules);
      const mainruleId = allRules
        .filter(r => (r.condition.regexFilter.replace(/\\/g, '')).includes(targetDomain))
        .map(o => +o.id + 1);
      //console.log("getDomainModifyHeadersRule domain rules:", mainruleId);
      const domainRule = allRules.filter(o =>
        o?.action?.type === "modifyHeaders" && mainruleId.includes(o?.id)
      );
      //console.log("getDomainModifyHeadersRule domain header rules:", domainRule);
      resolve(domainRule);
    });
  });
}

async function getLatestDomains(targetDomains) {
  return new Promise((resolve) => {
    chrome.declarativeNetRequest.getDynamicRules((allRules) => {
      //console.log("All rules:", allRules);

      // Filter domains that are present in the dynamic rules
      const validDomains = targetDomains.filter((domain) => {
        return allRules.some((rule) => {
          const regexFilter = rule.condition.regexFilter.replace(/\\/g, ''); // Remove escape characters
          return regexFilter.includes(domain); // Check if the rule matches the domain
        });
      });
      //console.log("getLatestDomains domains:", validDomains);
      resolve(validDomains);
    });
  });
}

// Function to be injected into the active tab
function displayExtensionMessage() {
  // Create a div for the message
  // Check if the message already exists
  if (document.getElementById('extension-warning-message')) {
    //console.log("Message already displayed on the page.");
    return; // Don't create another message
  }
  const messageDiv = document.createElement("div");
  messageDiv.id = 'extension-warning-message';
  messageDiv.style.position = "fixed";
  messageDiv.style.bottom = "2px";
  messageDiv.style.right = "10px";
  messageDiv.style.padding = "10px 15px";
  messageDiv.style.backgroundColor = "rgba(0, 123, 255, 0.9)";//"#4394eb";
  messageDiv.style.color = "white";
  messageDiv.style.fontSize = "14px";
  messageDiv.style.borderRadius = "5px";
  messageDiv.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
  messageDiv.style.zIndex = "10000";
  messageDiv.textContent = "Redirect to Local Server: Listening to APIs...❤️";


  // Append the message to the page
  document.body.appendChild(messageDiv);

  // Remove the message after 3 seconds
  setTimeout(() => {
    messageDiv.remove();
  }, 2000);
}

// Call the function to start listening to requests
listenToRequestsAndStoreHeaders();


chrome.action.onClicked.addListener(() => {
  const targetUrl = chrome.runtime.getURL("Redirect-to-local-Server.html");
  chrome.tabs.query({}, (allTabs) => {
    const existingTab = allTabs.find(tab => tab.url === targetUrl);
    if (existingTab) {
      chrome.tabs.remove(existingTab.id);
    }
    chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
      const activeTab = currentWindow.tabs.find(tab => tab.active);

      chrome.tabs.create({
        url: targetUrl,
        windowId: currentWindow.id,
        index: activeTab ? activeTab.index + 1 : undefined,
      });
    });
  });
});




