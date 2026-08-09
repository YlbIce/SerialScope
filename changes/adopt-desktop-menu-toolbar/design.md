# Design: adopt-desktop-menu-toolbar

Electron Main 使用 `Menu` 创建文件、视图、串口、窗口和帮助菜单。菜单通过受限 Preload notification 请求主窗口执行 UI 动作；Renderer 不获得任意 Main 权限。工具栏复用既有后端 RPC 和表单配置。
