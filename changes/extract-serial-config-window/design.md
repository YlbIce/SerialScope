# Design: extract-serial-config-window

配置窗口复用受限 Preload 与 Main 的单一 Named Pipe 客户端。串口草稿保存到 localStorage，并经 storage 事件同步到其他窗口；打开串口仍仅调用现有 `serial.open`。
