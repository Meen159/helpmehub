(function () {
  if (document.getElementById('inverz-widget-launcher')) return;

  var currentScript = document.currentScript;
  var resolvedHostOrigin = 'https://cms.helpmehub.co';

  if (currentScript && currentScript.src) {
    try {
      resolvedHostOrigin = new URL(currentScript.src, window.location.href).origin;
    } catch (error) {
      resolvedHostOrigin = 'https://cms.helpmehub.co';
    }
  }

  var cfg = window.INVERZ_WIDGET_CONFIG || window.InverzConfig || {};
  var apiKey = cfg.apiKey || 'YOUR_PROJECT_API_KEY_HERE';
  var projectId = cfg.projectId || '1';
  // Fallback colors before DB theme arrives: align with demo tone.
  var themeColors = { fabPrimary: '#d000ff', fabSecondary1: '#b000ff', fabSecondary2: '#7a00ff' };

  function applyTheme(theme) {
    if (!theme) return;
    if (theme.fabPrimary) themeColors.fabPrimary = theme.fabPrimary;
    if (theme.fabSecondary1) themeColors.fabSecondary1 = theme.fabSecondary1;
    if (theme.fabSecondary2) themeColors.fabSecondary2 = theme.fabSecondary2;
    updateLauncherColors();
  }

  function fetchTheme() {
    var endpoints = [
      'https://asia-southeast1-api-helpmehub-2026.cloudfunctions.net/api/widget/init?apiKey=' + encodeURIComponent(apiKey)
    ];

    var attempt = function (index) {
      if (index >= endpoints.length) return Promise.resolve();
      return fetch(endpoints[index])
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data && data.status === 'ok' && data.themeConfig && data.themeConfig.theme) {
            applyTheme(data.themeConfig.theme);
            return;
          }
          throw new Error('Invalid theme payload');
        })
        .catch(function () {
          return attempt(index + 1);
        });
    };

    return attempt(0);
  }

  var launcher = document.createElement('button');
  launcher.id = 'inverz-widget-launcher';
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Toggle chat widget');
  launcher.style.cssText = 'position:fixed;right:20px;bottom:20px;width:60px;height:60px;padding:0;border:none;border-radius:50%;cursor:pointer;z-index:100001;background:linear-gradient(135deg,#d000ff 0%,#b000ff 50%,#7a00ff 100%);color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;line-height:0;transition:transform .2s;';

  function getChatIcon() {
    return '<svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" style="display:block;pointer-events:none">'
      + '<defs>'
      + '<mask id="inverz-chat-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">'
      + '<rect width="16" height="16" fill="black"/>'
      + '<path d="M16 8c0 3.866-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.638.742-3.468 1.105a.5.5 0 0 1-.606-.606c.363-1.83.842-2.948 1.105-3.468A9.06 9.06 0 0 1 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7" fill="white"/>'
      + '<circle cx="4" cy="8" r="1" fill="black"/>'
      + '<circle cx="8" cy="8" r="1" fill="black"/>'
      + '<circle cx="12" cy="8" r="1" fill="black"/>'
      + '</mask>'
      + '</defs>'
      + '<rect width="16" height="16" fill="#ffffff" mask="url(#inverz-chat-mask)"/>'
      + '</svg>';
  }
  var closeIcon = '<svg width="32" height="32" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true" focusable="false" style="display:block;pointer-events:none"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/></svg>';
  launcher.innerHTML = getChatIcon();

  var iframe = document.createElement('iframe');
  iframe.id = 'inverz-widget-iframe';
  iframe.src = resolvedHostOrigin + '/?embed=true&apiKey=' + encodeURIComponent(apiKey) + '&projectId=' + encodeURIComponent(projectId);
  iframe.allow = 'clipboard-write';
  iframe.style.cssText = 'position:fixed;right:20px;bottom:92px;width:0;height:0;border:0;border-radius:18px;box-shadow:none;z-index:100000;display:none;opacity:0;pointer-events:none;background:#fff;color-scheme:light;transition:all .3s ease;';

  var isOpen = false;

  function updateLauncherColors() {
    launcher.style.background = 'linear-gradient(135deg,' + themeColors.fabPrimary + ' 0%,' + themeColors.fabSecondary1 + ' 50%,' + themeColors.fabSecondary2 + ' 100%)';
    if (!isOpen) launcher.innerHTML = getChatIcon();
  }

  function syncUI() {
    if (isOpen) {
      launcher.innerHTML = closeIcon;
      iframe.style.display = 'block';
      iframe.style.width = 'min(400px, calc(100vw - 24px))';
      iframe.style.height = 'min(640px, calc(100vh - 104px))';
      iframe.style.opacity = '1';
      iframe.style.pointerEvents = 'auto';
      iframe.style.boxShadow = '0 12px 24px rgba(0,0,0,.25)';
      setTimeout(function () {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'INVERZ_WIDGET_OPEN' }, '*');
        }
      }, 100);
    } else {
      launcher.innerHTML = getChatIcon();
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.boxShadow = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      setTimeout(function () { iframe.style.display = 'none'; }, 300);
    }
  }

  function closeWidget() {
    isOpen = false;
    syncUI();
  }

  launcher.addEventListener('click', function () {
    isOpen = !isOpen;
    syncUI();
  });

  launcher.addEventListener('mouseenter', function () { launcher.style.transform = 'scale(1.1)'; });
  launcher.addEventListener('mouseleave', function () { launcher.style.transform = 'scale(1)'; });

  window.addEventListener('message', function (event) {
    if (!event || !event.data) return;
    if (event.data.type === 'INVERZ_WIDGET_THEME' && event.data.theme) {
      applyTheme(event.data.theme);
      return;
    }
    if (event.data.type === 'INVERZ_WIDGET_CLOSE' || event.data.type === 'INVERZ_WIDGET_MINIMIZE') {
      closeWidget();
    }
  });

  document.body.appendChild(launcher);
  document.body.appendChild(iframe);
  fetchTheme();
  syncUI();
})();
