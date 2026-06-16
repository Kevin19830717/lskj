/**
 * Smart Scale Backend - Frontend JavaScript
 * API工具函数 + 认证管理 + 用户头像 + 通用UI辅助
 */

const API_BASE = '/api/v1';

// ============================================================
// API 工具函数
// ============================================================
function getHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? {'Authorization': 'Bearer ' + token} : {})
    };
}

async function apiGet(path) {
    const resp = await fetch(API_BASE + path, { headers: getHeaders() });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);
    return data;
}

async function apiPost(path, body) {
    const resp = await fetch(API_BASE + path, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);
    return data;
}

async function apiPut(path, body) {
    const resp = await fetch(API_BASE + path, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);
    return data;
}

async function apiDelete(path) {
    const resp = await fetch(API_BASE + path, {
        method: 'DELETE',
        headers: getHeaders()
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);
    return data;
}

// ============================================================
// 认证检查
// ============================================================
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return false;
    }
    // 加载侧边栏用户信息
    initSidebarUser();
    return true;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// ============================================================
// 侧边栏 —— 用户信息 & 头像
// ============================================================
function initSidebarUser() {
    // 从缓存读取或从API获取
    let user = null;
    try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) {}

    const nameEl = document.getElementById('sidebarUserName');
    const letterEl = document.getElementById('avatarLetter');
    const avatarCircle = document.getElementById('userAvatarCircle');
    const avatarImg = document.getElementById('avatarImg');

    if (nameEl) {
        nameEl.textContent = user.nickname || user.phone || '用户';
    }

    // 设置头像字母
    const displayName = (user.nickname || user.phone || '').trim();
    const firstChar = displayName.charAt(0).toUpperCase();
    if (letterEl && displayName) {
        letterEl.textContent = firstChar;
        // 同步个人信息页头像字母
        const phcLetter = document.getElementById('phcAvatarLetter');
        if (phcLetter) phcLetter.textContent = firstChar;
    }

    // 检查本地存储的头像
    if (avatarImg) {
        const savedAvatar = localStorage.getItem('user_avatar');
        if (savedAvatar) {
            avatarImg.src = savedAvatar;
            avatarImg.style.display = 'block';
            if (letterEl) letterEl.style.display = 'none';
        }
    }

    // 异步获取最新profile（更新昵称等）
    apiGet('/user/profile').then(res => {
        if (res.data) {
            const p = res.data;
            if (p.nickname) {
                if (nameEl) nameEl.textContent = p.nickname;
                const fc = p.nickname.charAt(0).toUpperCase();
                if (letterEl && !localStorage.getItem('user_avatar')) { 
                    letterEl.textContent = fc;
                    // 同步个人信息页头像字母
                    const phcLetter = document.getElementById('phcAvatarLetter');
                    if (phcLetter) phcLetter.textContent = fc;
                }
            }
        }
    }).catch(()=>{});
}

// 上传头像
function uploadAvatar(event) {
    event.stopPropagation();
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('图片不能超过5MB', 'error'); return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
        const dataUrl = ev.target.result;
        localStorage.setItem('user_avatar', dataUrl);

        const avatarImg = document.getElementById('avatarImg');
        const letterEl = document.getElementById('avatarLetter');

        if (avatarImg) {
            avatarImg.src = dataUrl;
            avatarImg.style.display = 'block';
        }
        if (letterEl) letterEl.style.display = 'none';

        showToast('头像已更新', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

// ============================================================
// 时间格式化
// ============================================================
function formatTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch(e) { return dateStr; }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    } catch(e) { return dateStr; }
}

// ============================================================
// UI 辅助
// ============================================================
function showLoading(show) { console.log(show ? 'Loading...' : 'Done'); }

function btnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '处理中...' : btn.dataset.originalText || btn.textContent;
    if (loading && !btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
}

function showToast(msg, type='info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    toast.style.cssText = `
        position:fixed;top:20px;right:20px;padding:14px 28px;border-radius:10px;
        color:white;font-size:14px;z-index:9999;animation:slideIn 0.35s ease both;
        font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,0.15);
        ${type==='error'?'background:linear-gradient(135deg,#f44336,#e53935)':type==='success'?'background:linear-gradient(135deg,#43A047,#2E7D32)':'background:linear-gradient(135deg,#2196F3,#1976D2)'}
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity='0'; transform:'translateY(-10px)'; setTimeout(()=>toast.remove(),300); }, 3000);
}

// ============================================================
// 全局错误处理
// ============================================================
window.addEventListener('unhandledrejection', e => {
    console.error('Unhandled promise rejection:', e.reason);
    showToast(e.reason?.message || '发生未知错误', 'error');
});
window.addEventListener('error', e => {
    console.error('Global error:', e.error);
});

// ============================================================
// 页面加载：主面板进入动画由CSS默认触发，无需额外JS干预
// ============================================================
