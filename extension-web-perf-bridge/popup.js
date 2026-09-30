/**
 * AutomatiQA Web Performance Agent Bridge - Popup Controller
 */

const NAMESPACE = 'automatiqa-web-performance';

function updateUI(status) {
  const badge = document.getElementById('agent-status-badge');
  const sslHelp = document.getElementById('ssl-help-container');

  if (badge) {
    if (status === 'connected') {
      badge.className = 'badge badge-success';
      badge.textContent = 'Connected (Secure)';
    } else if (status === 'untrusted') {
      badge.className = 'badge badge-warning';
      badge.textContent = 'SSL Authorization Needed';
    } else if (status === 'connecting') {
      badge.className = 'badge badge-warning';
      badge.textContent = 'Connecting...';
    } else {
      badge.className = 'badge badge-danger';
      badge.textContent = 'Disconnected';
    }
  }

  if (sslHelp) {
    sslHelp.style.display = status === 'untrusted' ? 'block' : 'none';
  }
}

function checkStatus() {
  chrome.runtime.sendMessage({
    namespace: NAMESPACE,
    action: 'check_status'
  }, (response) => {
    if (chrome.runtime.lastError) {
      updateUI('disconnected');
      return;
    }
    if (response && response.agentStatus) {
      updateUI(response.agentStatus);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  checkStatus();

  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      updateUI('connecting');
      checkStatus();
    });
  }

  const authSslBtn = document.getElementById('auth-ssl-btn');
  if (authSslBtn) {
    authSslBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        namespace: NAMESPACE,
        action: 'authorize_ssl'
      }, () => {
        // After opening tab, start polling
        setTimeout(checkStatus, 1000);
        setTimeout(checkStatus, 3000);
      });
    });
  }
});
