#include "AiAdapter.h"

#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>

namespace {

using ai::AiAdapter;
using ai::AiError;
using ai::AiProvider;
using ai::MockAiProvider;

void require(bool condition, const std::string& message) {
  if (!condition) {
    std::cerr << "FAILED: " << message << '\n';
    std::exit(1);
  }
}

// 一个模拟"需要上传数据"的 provider，用于验证授权边界。
class UploadingProvider final : public AiProvider {
public:
  std::string name() const override { return "uploading"; }
  bool requiresDataUpload() const override { return true; }
  ai::AiChatResponse chat(const std::string&) override {
    return {"uploaded", "uploading"};
  }
  ai::ProtocolParseResult parseProtocol(const std::string&) override {
    return {};
  }
  std::vector<ai::CommandSpec> generateCommands(const std::string&) override {
    return {};
  }
};

} // namespace

int main() {
  // 1. 未启用：任何调用抛 not-enabled
  {
    AiAdapter adapter;  // 默认 enabled=false
    bool caught = false;
    try {
      (void)adapter.chat("hello");
    } catch (const AiError& e) {
      caught = (e.code() == "not-enabled");
    }
    require(caught, "未启用 chat 必须抛 not-enabled");

    caught = false;
    try {
      (void)adapter.parseProtocol("AA 55");
    } catch (const AiError& e) {
      caught = (e.code() == "not-enabled");
    }
    require(caught, "未启用 parseProtocol 必须抛 not-enabled");
  }

  // 2. 启用 + mock（requiresDataUpload=false）正常
  {
    AiAdapter adapter;
    adapter.configure(true, false);
    auto response = adapter.chat("hello");
    require(response.modelName == "mock" && response.reply.find("hello") != std::string::npos,
            "mock chat 返回确定性回显");

    auto parsed = adapter.parseProtocol("ignored");
    require(parsed.header == (std::vector<unsigned char>{0xAA, 0x55}) && parsed.lengthFieldSize == 1,
            "mock parseProtocol 返回确定 header");

    auto commands = adapter.generateCommands("ignored");
    require(commands.size() == 2 && commands[0].name == "ReadDeviceInfo",
            "mock generateCommands 返回确定命令列表");
    require(adapter.callCount() == 3, "调用计数应为 3");
  }

  // 3. 启用但禁止上传 + 需上传的 provider：拒绝
  {
    AiAdapter adapter;
    adapter.configure(true, false);
    adapter.setProvider(std::make_shared<UploadingProvider>());
    bool caught = false;
    try {
      (void)adapter.chat("hello");
    } catch (const AiError& e) {
      caught = (e.code() == "data-upload-denied");
    }
    require(caught, "禁止上传时需上传 provider 必须抛 data-upload-denied");
    require(adapter.callCount() == 0, "被拒调用不得计入 provider 调用次数");
  }

  // 4. 启用 + 允许上传 + 需上传 provider：允许
  {
    AiAdapter adapter;
    adapter.configure(true, true);
    adapter.setProvider(std::make_shared<UploadingProvider>());
    auto response = adapter.chat("hello");
    require(response.reply == "uploaded", "允许上传时需上传 provider 可正常调用");
  }

  // 5. 未知 provider：抛 unknown-provider
  {
    AiAdapter adapter;
    bool caught = false;
    try {
      adapter.setProviderByName("no-such");
    } catch (const AiError& e) {
      caught = (e.code() == "unknown-provider");
    }
    require(caught, "未知 provider 必须抛 unknown-provider");
  }

  // 6. 空 provider：抛 invalid-provider
  {
    AiAdapter adapter;
    bool caught = false;
    try {
      adapter.setProvider(nullptr);
    } catch (const AiError& e) {
      caught = (e.code() == "invalid-provider");
    }
    require(caught, "空 provider 必须抛 invalid-provider");
  }

  // 7. 按名称选择 mock 并验证 providerName
  {
    AiAdapter adapter;
    adapter.setProviderByName("mock");
    require(adapter.providerName() == "mock", "setProviderByName(mock) 生效");
    require(!adapter.providerName().empty(), "provider 名非空");
  }

  std::cout << "AiAdapter tests passed\n";
  return 0;
}
