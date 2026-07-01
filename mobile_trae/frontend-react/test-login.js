// 免登录测试脚本
// 用法：
//   1. 在浏览器书签栏新建书签，URL 粘贴下面这行（javascript:开头）
//   2. 或者打开浏览器控制台(F12)，粘贴整段代码回车
//
// 书签版（复制这一整行作为书签 URL）：
// javascript:(async()=>{const r=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13800138001',password:'123456'})});const d=await r.json();if(d.data){localStorage.setItem('token',d.data.token);localStorage.setItem('user',JSON.stringify(d.data.user));location.href='/foods';}})();

(async () => {
  const r = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800138001', password: '123456' })
  });
  const d = await r.json();
  if (d.data) {
    localStorage.setItem('token', d.data.token);
    localStorage.setItem('user', JSON.stringify(d.data.user));
    console.log('✅ 登录成功，跳转食物库...');
    location.href = '/foods';
  } else {
    console.error('❌ 登录失败:', d);
  }
})();
