# Specification: prepare-release-and-external-validation

## Requirement: external gates remain explicit

项目 MUST 在发布、跨会话、许可证和真实设备验证前保留可检查的人工闸门。没有该项所需外部证据时，MUST 记录 `blocked` 或 `not-run`，不得声称通过。

### Scenario: unavailable signing certificate

- GIVEN 未提供可用的 Authenticode 签名通道
- WHEN 准备发布 Windows 安装包
- THEN 不生成或发布未授权的生产签名制品，证据记录为 blocked。

### Scenario: unapproved physical device

- GIVEN 未提供设备、参数和两次确认
- WHEN 请求真实设备回归
- THEN 不打开或写入真实串口，证据记录为 not-run。

## Non-requirements

本 change 不替代发布负责人、Windows 管理员、法务或设备负责人的审批。
