# Design: validate-resizable-module-windows

生产 Electron 以 remote debugging 启动。测试通过 CDP `Runtime.evaluate` 在各 Renderer 执行 `window.resizeTo(width, height)`，再读取 `window.outerWidth/outerHeight` 验证宽高确实生效且页面仍可用。本机 Electron 调试协议未暴露 `Browser.getWindowForTarget`，故不依赖该不可用域。
