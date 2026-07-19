import { BrowserRouter, Routes, Route } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from 'react';
import AdminLogin from './admin/AdminLogin';
import AdminDashboard from './admin/AdminDashboard';
import ProtectedRoute from './components/js/ProtectedRoute'; 
import Launcher from './components/js/Launcher';
import WidgetWindow from './components/js/WidgetWindow';
import './App.css';
import { fetchWidgetThemeConfig, getScopedChatUserStorageKey, getWidgetRuntimeConfig, HOSTING_ORIGIN } from './config/api'; 

const defaultThemeConfig = {
    theme: {
        typography: 'Rubik', chatHeaderBg: '#e8f0fe',
        iconPrimary: '#ffffff', iconSecondary: '#000000', btnColor: '#000000',
        questionTitleColor: '#111111', tabIconColor: '#2b69dd',
        fabPrimary: '#052699', fabSecondary1: '#116819', fabSecondary2: '#21bcae'
    },
    chatTheme: {
        typography: 'Rubik', greetingText: '#2b69dd', userBubble: '#2b69dd',
        userText: '#ffffff', sendBtn: '#2b69dd'
    }
};

function WidgetApp() {
  const isEmbedMode = window.location.search.includes('embed=true');
  const runtimeConfig = getWidgetRuntimeConfig();
  const [isOpen, setIsOpen] = useState(isEmbedMode);
  const [activeTab, setActiveTab] = useState('home');
  const [user, setUser] = useState(null);
  const [autoFaq, setAutoFaq] = useState(null);

  useEffect(() => {
    if (isEmbedMode) {
      document.documentElement.classList.add('embed-mode');
      document.body.classList.add('embed-mode');
      document.body.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
      document.body.style.colorScheme = 'light';
      const style = document.createElement('style');
      style.setAttribute('data-embed-mode-style', 'true');
      style.textContent = 'body, html, #root { background: transparent !important; }';
      document.head.appendChild(style);

      return () => {
        document.documentElement.classList.remove('embed-mode');
        document.body.classList.remove('embed-mode');
        document.body.style.background = '';
        document.documentElement.style.background = '';
        document.body.style.colorScheme = '';
        style.remove();
      };
    }

    return undefined;
  }, [isEmbedMode]);
  
  const [projectTheme, setProjectTheme] = useState(null);

  useEffect(() => {
    const storageKey = getScopedChatUserStorageKey(runtimeConfig.apiKey);
    const savedUser = localStorage.getItem(storageKey);
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        localStorage.removeItem(storageKey);
        setUser(null);
      }
    } else {
      setUser(null);
    }

    const fetchThemeData = async () => {
      const themeConfig = await fetchWidgetThemeConfig(runtimeConfig.apiKey);
      const resolvedThemeConfig = themeConfig || defaultThemeConfig;

      setProjectTheme(resolvedThemeConfig);

      if (themeConfig && isEmbedMode && window.parent && window.parent !== window && themeConfig.theme) {
        window.parent.postMessage({ type: 'INVERZ_WIDGET_THEME', theme: themeConfig.theme }, '*');
      }
    };

    fetchThemeData();
  }, [isEmbedMode, runtimeConfig.apiKey]);

  const handleRegisterSuccess = (newUser) => {
    setUser(newUser);
    localStorage.setItem(getScopedChatUserStorageKey(runtimeConfig.apiKey), JSON.stringify(newUser));
    setActiveTab('chat');
  };

  const handleWidgetClose = () => {
    if (isEmbedMode && window.parent && window.parent !== window) {
      setIsOpen(false);
      window.parent.postMessage({ type: 'INVERZ_WIDGET_CLOSE' }, '*');
      window.parent.postMessage({ type: 'INVERZ_WIDGET_MINIMIZE' }, '*');
      return;
    }
    setIsOpen(false);
  };

  // รับ message จาก parent เพื่อเปิด widget ใหม่ (สำหรับ embed mode)
  useEffect(() => {
    if (!isEmbedMode) return;
    
    const handleParentMessage = (event) => {
      if (!event || !event.data) return;
      if (event.data.type === 'INVERZ_WIDGET_OPEN') {
        setIsOpen(true);
        setActiveTab('home');
      }
    };

    window.addEventListener('message', handleParentMessage);
    return () => window.removeEventListener('message', handleParentMessage);
  }, [isEmbedMode]);

  if (!projectTheme) return null;

  return (
    <>
      {!isEmbedMode && (
        <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5'}}>
           <h1>Customer Website Demo</h1>
        </div>
      )}
      
      {!isEmbedMode && <Launcher isOpen={isOpen} toggle={() => setIsOpen(!isOpen)} theme={projectTheme.theme} />}
      
      {isOpen && (
        <WidgetWindow 
           activeTab={activeTab} 
           setActiveTab={setActiveTab}
           user={user}
           onRegisterSuccess={handleRegisterSuccess}
           toggle={handleWidgetClose}
           autoFaq={autoFaq}
           setAutoFaq={setAutoFaq} 
           projectTheme={projectTheme}
           embedMode={isEmbedMode}
           apiKey={runtimeConfig.apiKey}
        />
      )}
    </>
  );
}

function EmbedScriptPage() {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '100vh', padding: '2rem', background: '#f6f7fb' }}>
      <h1 className="mb-3">Embed Script for External Sites</h1>
      <p className="text-muted mb-4" style={{ maxWidth: '640px', textAlign: 'center' }}>
        วางโค้ดนี้ในไฟล์ HTML ของเว็บลูกค้า เพื่อโหลด HelpMeHub widget จาก backend ของคุณ:
      </p>
      <pre style={{ width: '100%', maxWidth: '920px', background: '#ffffff', border: '1px solid #e3e4ed', borderRadius: '8px', padding: '1rem', overflowX: 'auto' }}>
        <code>{`<script>
window.INVERZ_WIDGET_CONFIG = {
  apiKey: 'pj_INVERZ2026',
  projectId: '1',
  user: { name: 'สมชาย ทดสอบ', email: 'somchai_auto@test.com' }
};
</script>
<script src="${HOSTING_ORIGIN}/embed-loader.js" async></script>`}</code>
      </pre>
      <p className="mt-3">หรือทดสอบ local:</p>
      <pre style={{ width: '100%', maxWidth: '920px', background: '#ffffff', border: '1px solid #e3e4ed', borderRadius: '8px', padding: '1rem', overflowX: 'auto' }}>
        <code>{`<script src="http://localhost:5173/embed-loader.js" async></script>`}</code>
      </pre>
    </div>
  );
}

function App() {
  const isEmbedEntry = window.location.search.includes('embed=true');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isEmbedEntry ? <WidgetApp /> : <AdminLogin />} />
        <Route path="/Demo" element={<WidgetApp />} />
        <Route path="/demo" element={<WidgetApp />} />
        <Route path="/embed" element={<EmbedScriptPage />} />
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;