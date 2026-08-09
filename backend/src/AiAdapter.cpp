#include "AiAdapter.h"

#include <cstdint>
#include <utility>

namespace ai {

std::string MockAiProvider::name() const {
  return "mock";
}

bool MockAiProvider::requiresDataUpload() const {
  // 本地 mock 不离开本机。
  return false;
}

AiChatResponse MockAiProvider::chat(const std::string& userInput) {
  return {
      "mock-echo: " + userInput,
      "mock",
  };
}

ProtocolParseResult MockAiProvider::parseProtocol(const std::string& /*protocolText*/) {
  ProtocolParseResult result;
  result.header = {0xAA, 0x55};
  result.lengthFieldOffset = 2;
  result.lengthFieldSize = 1;
  result.fields = {
      {"command", 2, 1},
      {"payload", 3, 0},
  };
  return result;
}

std::vector<CommandSpec> MockAiProvider::generateCommands(const std::string& /*protocolText*/) {
  return {
      {"ReadDeviceInfo", {0xAA, 0x55, 0x01}, "mock read device info"},
      {"ResetDevice", {0xAA, 0x55, 0x02}, "mock reset device"},
  };
}

AiAdapter::AiAdapter()
    : provider_(std::make_shared<MockAiProvider>()) {}

void AiAdapter::configure(bool enabled, bool allowDataUpload) {
  enabled_ = enabled;
  allowDataUpload_ = allowDataUpload;
}

void AiAdapter::setProvider(std::shared_ptr<AiProvider> provider) {
  if (!provider) {
    throw AiError("invalid-provider", "provider must not be null");
  }
  provider_ = std::move(provider);
}

void AiAdapter::setProviderByName(const std::string& name) {
  if (name == "mock") {
    setProvider(std::make_shared<MockAiProvider>());
    return;
  }
  throw AiError("unknown-provider", "unknown AI provider: " + name);
}

void AiAdapter::ensureAuthorized() {
  if (!enabled_) {
    throw AiError("not-enabled", "AI is not enabled");
  }
  if (provider_->requiresDataUpload() && !allowDataUpload_) {
    throw AiError("data-upload-denied", "provider requires data upload but upload is not allowed");
  }
}

AiChatResponse AiAdapter::chat(const std::string& userInput) {
  ensureAuthorized();
  ++callCount_;
  return provider_->chat(userInput);
}

ProtocolParseResult AiAdapter::parseProtocol(const std::string& protocolText) {
  ensureAuthorized();
  ++callCount_;
  return provider_->parseProtocol(protocolText);
}

std::vector<CommandSpec> AiAdapter::generateCommands(const std::string& protocolText) {
  ensureAuthorized();
  ++callCount_;
  return provider_->generateCommands(protocolText);
}

} // namespace ai
