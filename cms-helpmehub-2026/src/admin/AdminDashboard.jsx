// src/admin/AdminDashboard.jsx
import { useState, useEffect } from 'react'; 
import { ChatDots, CodeSlash, People, ChatSquareText, X, BoxArrowRight, Folder2Open, ExclamationCircle, Person } from 'react-bootstrap-icons';
import ChatPage from './pages/ChatPage';
import EmbedPage from './pages/EmbedPage';
import UsersPage from './pages/UsersPage'; 
import FaqPage from './pages/FaqPage'; 
import ProjectPage from './pages/ProjectPage';
import CustomerPage from './pages/CustomerPage';
import logo from './img/logo.svg'; 
import { API_URL } from '../config/api';
import './css/admin-layout.css';

const SELECTED_PROJECT_STORAGE_KEY = 'admin_selected_project_id';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('chat'); 
    const [selectedProject, setSelectedProject] = useState(null); 
    const [myProjects, setMyProjects] = useState([]); 
    const [sessionExpiredModal, setSessionExpiredModal] = useState({ show: false, title: '', message: '' });
    
    //State Logout Modal
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    
    const [adminInfo, setAdminInfo] = useState({ 
        name: 'Admin', email: 'admin@inverz.com', role: 'ADMIN', profile_image: null 
    });

    useEffect(() => {
        const storedInfo = localStorage.getItem('admin_info');
        const token = localStorage.getItem('admin_token');
        const storedProjectId = localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY);
        
        if (storedInfo) {
            setAdminInfo(JSON.parse(storedInfo));
        }

        if (token) {
            const baseUrl = API_URL.replace('/widget', '');

            fetch(`${baseUrl}/admin/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
                if (data.admin) {
                    setAdminInfo(data.admin);
                    localStorage.setItem('admin_info', JSON.stringify(data.admin));
                }
            })
            .catch(err => console.error('Error fetching admin profile:', err));
            
            fetch(`${baseUrl}/admin/my-projects`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
                const projectList = data.data || [];
                setMyProjects(projectList);
                if (projectList.length > 0) {
                    const matchedProject = storedProjectId
                        ? projectList.find((project) => String(project.id) === String(storedProjectId))
                        : null;
                    const nextProject = matchedProject || projectList[0];
                    setSelectedProject(nextProject);
                    localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, String(nextProject.id));
                } else {
                    setSelectedProject(null);
                    localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
                }
            })
            .catch(err => console.error("Error fetching my projects:", err));
        }
    }, []);

    const handleProjectChange = (projectId) => {
        const normalizedProjectId = String(projectId);
        const matchedProject = myProjects.find((project) => String(project.id) === normalizedProjectId) || null;
        setSelectedProject(matchedProject);
        if (matchedProject) {
            localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, normalizedProjectId);
        } else {
            localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
        }
    };

    const handleLogoutClick = () => {
        setShowLogoutModal(true);
    };

    useEffect(() => {
        const originalFetch = window.fetch.bind(window);

        window.fetch = async (...args) => {
            const response = await originalFetch(...args);

            if (response.status === 401) {
                localStorage.removeItem('admin_token');
                localStorage.removeItem('admin_info');
                localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
                setSessionExpiredModal({
                    show: true,
                    title: 'Session Expired',
                    message: 'Your admin session has expired. Please log in again to continue.'
                });
            }

            return response;
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    const confirmLogout = () => {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_info');
        localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
        window.location.href = '/login';
    };

    const handleSessionExpiredConfirm = () => {
        setSessionExpiredModal({ show: false, title: '', message: '' });
        window.location.href = '/login';
    };

    const avatarLetter = adminInfo.name ? adminInfo.name.charAt(0).toUpperCase() : 'A';
    const canSeeManagementMenus = ['OWNER', 'SUPER_ADMIN', 'ADMIN'].includes(adminInfo.role);

    return (
        <div className="admin-container position-relative">
            <div className="sidebar shadow-sm border-end">
                <div className="logo-area">
                    <img src={logo} alt="Inverz Logo" className="sidebar-logo" style={{ width: '150px', height: 'auto' }} />
                </div>
                
                <div className="sidebar-menu">
                    <div 
                        className={`menu-item ${activeTab === 'chat' ? 'active' : ''} admin-tab-button`} 
                        onClick={() => setActiveTab('chat')}
                    >
                        <ChatDots size={20} className="me-3" />
                        <span className="fw-bold">Chat</span>
                    </div>

                    <hr className="my-2 mx-3 text-muted" style={{opacity: 0.2}} />

                    <div 
                        className={`menu-item ${activeTab === 'embed' ? 'active' : ''} admin-tab-button`} 
                        onClick={() => setActiveTab('embed')}
                    >
                        <CodeSlash size={20} className="me-3" />
                        <span className="fw-bold">Embed Script</span>
                    </div>

                    <div 
                        className={`menu-item ${activeTab === 'customers' ? 'active' : ''} admin-tab-button`} 
                        onClick={() => setActiveTab('customers')}
                    >
                        <Person size={20} className="me-3" />
                        <span className="fw-bold">Customer</span>
                    </div>

                    <div 
                        className={`menu-item ${activeTab === 'faq' ? 'active' : ''} admin-tab-button`} 
                        onClick={() => setActiveTab('faq')}
                    >
                        <ChatSquareText size={20} className="me-3" />
                        <span className="fw-bold">FAQ management</span>
                    </div>

                    {canSeeManagementMenus && (
                        <>
                            <div 
                                className={`menu-item ${activeTab === 'projects' ? 'active' : ''} admin-tab-button`} 
                                onClick={() => setActiveTab('projects')}
                            >
                                <Folder2Open size={20} className="me-3" />
                                <span className="fw-bold">Project Management</span>
                            </div>

                            <div 
                                className={`menu-item ${activeTab === 'users' ? 'active' : ''} admin-tab-button`} 
                                onClick={() => setActiveTab('users')}
                            >
                                <People size={20} className="me-3" />
                                <span className="fw-bold">User Management</span>
                            </div>
                        </>
                    )}
                </div>

                {/* --- Profile Area (มุมซ้ายล่าง) --- */}
                <div className="user-profile-bottom border-top p-3">
                    <div className="d-flex align-items-center w-100">
                        
                        {adminInfo.profile_image ? (
                            <img 
                                src={adminInfo.profile_image} 
                                alt="Profile" 
                                className="rounded-circle me-3 shadow-sm border" 
                                style={{ width: '42px', height: '42px', minWidth: '42px', objectFit: 'cover' }} 
                            />
                        ) : (
                            <div className="avatar-profile me-3 d-flex align-items-center justify-content-center bg-primary-subtle text-primary rounded-circle fw-bold border border-primary-subtle shadow-sm" 
                                 style={{width: 42, height: 42, minWidth: 42}}>
                                {avatarLetter}
                            </div>
                        )}
                        
                        <div className="flex-grow-1 overflow-hidden">
                            <div className="fw-bold text-truncate text-dark" style={{fontSize: '0.9rem'}}>{adminInfo.name}</div>
                            <div className="text-muted small text-truncate" style={{fontSize: '0.75rem'}}>
                                {adminInfo.email}
                            </div>
                        </div>
                        
                        <button onClick={handleLogoutClick} className="btn btn-link btn-sm ms-2 text-primary px-0 fw-bold logout-trigger-btn" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
                            Logout
                        </button>
                    </div>
                </div>
            </div>

            {/* --- Content Area --- */}
            <div className="content-area bg-light">
                {activeTab === 'chat' && <ChatPage currentProject={selectedProject} projects={myProjects} onProjectChange={handleProjectChange} />}
                {activeTab === 'customers' && <CustomerPage currentProject={selectedProject} projects={myProjects} onProjectChange={handleProjectChange} />}
                {activeTab === 'embed' && <EmbedPage currentProject={selectedProject} projects={myProjects} onProjectChange={handleProjectChange} />}
                {activeTab === 'projects' && <ProjectPage adminInfo={adminInfo} />}
                {activeTab === 'users' && <UsersPage adminInfo={adminInfo} />} 
                {activeTab === 'faq' && <FaqPage currentProject={selectedProject} projects={myProjects} onProjectChange={handleProjectChange} adminInfo={adminInfo} />}
            </div>

            {showLogoutModal && (
                <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center modal-overlay-backdrop admin-modal-overlay" style={{ backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9999 }}>
                    <div className="bg-white p-4 rounded-4 shadow-lg text-center position-relative logout-modal-box admin-modal-card" style={{ width: 380 }}>
                        
                        <X size={24} className="position-absolute cursor-pointer text-muted logout-close-btn" style={{ top: 15, right: 15 }} onClick={() => setShowLogoutModal(false)} />
                        
                        <div className="mx-auto d-flex justify-content-center align-items-center mb-3 mt-2 logout-icon-container" 
                             style={{ width: 64, height: 64, backgroundColor: '#e0f2fe', borderRadius: '50%' }}>
                            <BoxArrowRight size={30} className="text-primary" />
                        </div>
                        
                        <h5 className="fw-bolder mb-2 text-dark">Ready to leave?</h5>
                        <p className="text-muted small mb-4 px-2">Are you sure you want to log out of your account? You will need to sign in again to access the dashboard.</p>
                        
                        <div className="d-flex justify-content-center gap-3">
                            <button className="btn rounded-pill bg-light text-muted px-4 fw-bold shadow-sm btn-cancel-logout" onClick={() => setShowLogoutModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary text-white rounded-pill px-4 fw-bold shadow-sm btn-confirm-logout" onClick={confirmLogout}>
                                Yes, Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {sessionExpiredModal.show && (
                <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center admin-modal-overlay" style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 10000 }}>
                    <div className="bg-white p-4 rounded-4 shadow-lg text-center position-relative admin-modal-card" style={{ width: 'min(420px, calc(100vw - 32px))' }}>
                        <div className="mx-auto d-flex justify-content-center align-items-center mb-3 mt-2" style={{ width: 72, height: 72, backgroundColor: '#fee2e2', borderRadius: '50%', color: '#dc2626' }}>
                            <ExclamationCircle size={34} />
                        </div>

                        <h5 className="fw-bolder mb-2 text-dark">{sessionExpiredModal.title}</h5>
                        <p className="text-muted small mb-4 px-2">{sessionExpiredModal.message}</p>

                        <button className="btn btn-primary text-white rounded-pill px-4 fw-bold shadow-sm admin-action-btn" onClick={handleSessionExpiredConfirm}>
                            Log In Again
                        </button>
                    </div>
                </div>
            )}
            
        </div>
    );
}