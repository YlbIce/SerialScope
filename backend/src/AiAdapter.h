#pragma once

#include <cstdint>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace ai {

// 异常，code 用于后续 IPC 映射为 JSON-RPC error。
class AiError final : public std::runtime_error {
public:
  AiError(std::string code, const std::string& message)
      : std::runtime_error(message), code_(std::move(code)) {}

  const std::string& code() const { return code_; }

private:
  std::string code_;
};

struct AiChatResponse {
  std::string reply;
  std::string modelName;
};

struct ProtocolField {
  std::string name;
  int offset = 0;
  int size = 0;
};

struct ProtocolParseResult {
  std::vector<unsigned char> header;   // 帧头特征码
  int lengthFieldOffset = 0;
  int lengthFieldSize = 0;
  std::vector<ProtocolField> fields;
};

struct CommandSpec {
  std::string name;
  std::vector<unsigned char> code;
  std::string description;
};

// 数据上传边界：真实网络 provider 必须 requiresDataUpload()==true，
// 从而强制 AiAdapter 在 allowDataUpload=false 时拒绝调用。
class AiProvider {
public:
  virtual ~AiProvider() = default;

  virtual std::string name() const = 0;
  virtual bool requiresDataUpload() const = 0;
  virtual AiChatResponse chat(const std::string& userInput) = 0;
  virtual ProtocolParseResult parseProtocol(const std::string& protocolText) = 0;
  virtual std::vector<CommandSpec> generateCommands(const std::string& protocolText) = 0;
};

// 本地 mock，不联网。
class MockAiProvider final : public AiProvider {
public:
  std::string name() const override;
  bool requiresDataUpload() const override;
  AiChatResponse chat(const std::string& userInput) override;
  ProtocolParseResult parseProtocol(const std::string& protocolText) override;
  std::vector<CommandSpec> generateCommands(const std::string& protocolText) override;
};

// 门面：强制授权边界，持有 provider。
class AiAdapter final {
public:
  AiAdapter();

  void configure(bool enabled, bool allowDataUpload);
  void setProvider(std::shared_ptr<AiProvider> provider);
  void setProviderByName(const std::string& name);

  AiChatResponse chat(const std::string& userInput);
  ProtocolParseResult parseProtocol(const std::string& protocolText);
  std::vector<CommandSpec> generateCommands(const std::string& protocolText);

  bool enabled() const { return enabled_; }
  bool allowDataUpload() const { return allowDataUpload_; }
  std::string providerName() const { return provider_->name(); }

  // 测试辅助：统计实际进入 provider 的调用次数。
  std::size_t callCount() const { return callCount_; }

private:
  void ensureAuthorized();

  bool enabled_ = false;
  bool allowDataUpload_ = false;
  std::shared_ptr<AiProvider> provider_;
  std::size_t callCount_ = 0;
};

} // namespace ai
