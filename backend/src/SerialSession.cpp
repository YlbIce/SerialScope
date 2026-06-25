#include "SerialSession.h"

#include <algorithm>
#include <sstream>
#include <utility>

#include <CSerialPort/SerialPortInfo.h>

namespace asio = boost::asio;
using protocol::Bytes;
using protocol::Json;

namespace {

std::string portSystemLocation(const std::string& portName) {
  if (portName.rfind("COM", 0) == 0 && portName.size() > 4) {
    return "\\\\.\\" + portName;
  }
  return portName;
}

std::string cString(const char* value) {
  return value == nullptr ? std::string() : std::string(value);
}

std::pair<std::string, std::string> parseHardwareId(const std::string& hardwareId) {
  const auto separator = hardwareId.find(':');
  if (separator == std::string::npos) {
    return {"", ""};
  }
  return {hardwareId.substr(0, separator), hardwareId.substr(separator + 1)};
}

} // namespace

SerialSession::SerialSession(asio::io_context& io)
  : io_(io) {
}

void SerialSession::setEventHandler(EventHandler handler) {
  eventHandler_ = std::move(handler);
}

Json SerialSession::stateJson() const {
  const auto uptimeMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::steady_clock::now() - startTime_
  ).count();

  std::scoped_lock lock(portMutex_);
  return {
    {"isOpen", port_.isOpen()},
    {"portName", portName_},
    {"lastPortName", lastPortName_},
    {"baudRate", baudRate_},
    {"rxBytes", rxBytes_},
    {"txBytes", txBytes_},
    {"rxFrames", rxFrames_},
    {"txFrames", txFrames_},
    {"uptimeMs", uptimeMs}
  };
}

Json SerialSession::open(const Json& config) {
  close();

  const std::string portName = config.value("portName", "");
  if (portName.empty()) {
    return {{"ok", false}, {"message", "未选择串口"}};
  }

  baudRate_ = config.value("baudRate", 115200);

  std::string errorMessage;
  {
    std::scoped_lock lock(portMutex_);
    // CSerialPort 负责平台串口细节；这里保持协议配置到库配置的简单映射。
    port_.init(
      portName.c_str(),
      baudRate_,
      parseParity(config.value("parity", "none")),
      parseDataBits(config.value("dataBits", 8)),
      parseStopBits(config.value("stopBits", "1")),
      parseFlowControl(config.value("flowControl", "none")),
      static_cast<unsigned int>(readBuffer_.size())
    );
    port_.setOperateMode(itas109::AsynchronousOperate);
    port_.setReadIntervalTimeout(1);
    port_.setMinByteReadNotify(1);

    if (!port_.open()) {
      errorMessage = "打开串口失败：" + lastErrorMessage();
    }

    if (errorMessage.empty()) {
      const int eventStatus = port_.connectReadEvent(this);
      if (eventStatus != itas109::ErrorOK) {
        errorMessage = "注册串口读取事件失败，错误码：" + std::to_string(eventStatus);
        port_.close();
      }
    }
  }

  if (!errorMessage.empty()) {
    emitState(errorMessage);
    return {{"ok", false}, {"message", errorMessage}};
  }

  // 串口配置成功后再重置统计，避免打开失败时破坏前端已有状态。
  portName_ = portName;
  lastPortName_ = portName;
  rxBytes_ = 0;
  txBytes_ = 0;
  rxFrames_ = 0;
  txFrames_ = 0;
  startTime_ = std::chrono::steady_clock::now();
  emitState("串口已打开");
  return {{"ok", true}, {"message", "串口已打开"}, {"state", stateJson()}};
}

Json SerialSession::close() {
  {
    std::scoped_lock lock(portMutex_);
    if (port_.isOpen()) {
      port_.disconnectReadEvent();
      port_.close();
    }
  }
  portName_.clear();
  emitState("串口已关闭");
  return {{"ok", true}, {"message", "串口已关闭"}, {"state", stateJson()}};
}

Json SerialSession::sendPayload(const Json& payload) {
  {
    std::scoped_lock lock(portMutex_);
    if (!port_.isOpen()) {
      return {{"ok", false}, {"message", "串口未打开"}};
    }
  }

  Bytes bytes;
  const std::string mode = payload.value("mode", "text");
  if (mode == "hex") {
    std::string error;
    if (!protocol::hexToBytes(payload.value("data", ""), bytes, error)) {
      return {{"ok", false}, {"message", error}};
    }
  } else {
    bytes = protocol::textToBytes(payload.value("data", ""), payload.value("lineEnding", "none"));
  }

  if (payload.value("appendModbusCrc", false)) {
    protocol::appendModbusCrc(bytes);
  }

  if (bytes.empty()) {
    return {{"ok", false}, {"message", "发送内容为空"}};
  }

  int written = -1;
  {
    std::scoped_lock lock(portMutex_);
    written = port_.writeData(bytes.data(), static_cast<int>(bytes.size()));
  }

  if (written < 0) {
    return {{"ok", false}, {"message", "写入失败：" + lastErrorMessage()}};
  }

  Bytes sent(bytes.begin(), bytes.begin() + static_cast<std::ptrdiff_t>(written));
  txBytes_ += static_cast<std::uint64_t>(written);
  txFrames_ += 1;
  emitTransferEvent("tx", sent);
  emitState();
  return {{"ok", true}, {"bytes", written}, {"state", stateJson()}};
}

itas109::DataBits SerialSession::parseDataBits(int value) {
  switch (std::clamp(value, 5, 8)) {
    case 5: return itas109::DataBits5;
    case 6: return itas109::DataBits6;
    case 7: return itas109::DataBits7;
    default: return itas109::DataBits8;
  }
}

itas109::Parity SerialSession::parseParity(const std::string& value) {
  if (value == "even") return itas109::ParityEven;
  if (value == "odd") return itas109::ParityOdd;
  if (value == "mark") return itas109::ParityMark;
  if (value == "space") return itas109::ParitySpace;
  return itas109::ParityNone;
}

itas109::StopBits SerialSession::parseStopBits(const std::string& value) {
  if (value == "1.5") return itas109::StopOneAndHalf;
  if (value == "2") return itas109::StopTwo;
  return itas109::StopOne;
}

itas109::FlowControl SerialSession::parseFlowControl(const std::string& value) {
  if (value == "hardware") return itas109::FlowHardware;
  if (value == "software") return itas109::FlowSoftware;
  return itas109::FlowNone;
}

void SerialSession::onReadEvent(const char*, unsigned int readBufferLen) {
  if (readBufferLen == 0) {
    return;
  }

  Bytes bytes(std::min<std::size_t>(readBufferLen, readBuffer_.size()));
  int read = -1;
  {
    std::scoped_lock lock(portMutex_);
    if (!port_.isOpen()) {
      return;
    }
    read = port_.readData(bytes.data(), static_cast<int>(bytes.size()));
  }

  if (read <= 0) {
    return;
  }

  bytes.resize(static_cast<std::size_t>(read));
  // CSerialPort 的读取通知来自库内部线程；转回 Asio 主线程再更新状态并广播。
  asio::post(io_, [self = shared_from_this(), bytes = std::move(bytes)]() mutable {
    self->handleReceived(std::move(bytes));
  });
}

void SerialSession::handleReceived(Bytes bytes) {
  rxBytes_ += bytes.size();
  rxFrames_ += 1;
  emitTransferEvent("rx", bytes);
  emitState();
}

void SerialSession::emitState(const std::string& message) {
  if (!eventHandler_) {
    return;
  }
  Json payload = stateJson();
  if (!message.empty()) {
    payload["message"] = protocol::sanitizeUtf8(message);
  }
  eventHandler_({{"type", "serial:state"}, {"payload", payload}});
}

void SerialSession::emitTransferEvent(const std::string& direction, const Bytes& bytes) {
  if (!eventHandler_) {
    return;
  }
  eventHandler_({
    {"type", "serial:" + direction},
    {"payload", {
      {"timestamp", protocol::utcTimestamp()},
      {"direction", direction},
      {"bytes", bytes.size()},
      {"text", protocol::bytesToDisplayText(bytes)},
      {"hex", protocol::bytesToHex(bytes)}
    }}
  });
}

std::string SerialSession::lastErrorMessage() const {
  const char* raw = port_.getLastErrorMsg();
  if (raw == nullptr || raw[0] == '\0') {
    return "未知错误，错误码：" + std::to_string(port_.getLastError());
  }
  return protocol::nativeToUtf8(raw);
}

Json listSerialPorts() {
  Json ports = Json::array();
  const auto infos = itas109::CSerialPortInfo::availablePortInfos();

  for (const auto& info : infos) {
    const std::string portName = protocol::nativeToUtf8(cString(info.portName));
    const std::string description = protocol::nativeToUtf8(cString(info.description));
    const std::string hardwareId = protocol::nativeToUtf8(cString(info.hardwareId));
    const auto [vendorId, productId] = parseHardwareId(hardwareId);

    ports.push_back({
      {"portName", portName},
      {"systemLocation", portSystemLocation(portName)},
      {"description", description},
      {"manufacturer", ""},
      {"serialNumber", ""},
      {"vendorId", vendorId},
      {"productId", productId}
    });
  }

  return {{"ports", ports}};
}
