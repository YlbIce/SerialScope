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
  if (!config.is_object()) {
    return {{"ok", false}, {"message", "串口配置必须是 JSON 对象"}};
  }

  std::string portName;
  int baudRate = 115200;
  int dataBits = 8;
  std::string parity;
  std::string stopBits;
  std::string flowControl;
  try {
    portName = config.value("portName", std::string());
    baudRate = config.value("baudRate", 115200);
    dataBits = config.value("dataBits", 8);
    parity = config.value("parity", std::string("none"));
    stopBits = config.value("stopBits", std::string("1"));
    flowControl = config.value("flowControl", std::string("none"));
  } catch (const Json::type_error&) {
    return {{"ok", false}, {"message", "串口配置字段类型无效"}};
  }

  if (portName.empty()) {
    return {{"ok", false}, {"message", "未选择串口"}};
  }
  if (baudRate < 110 || baudRate > 4'000'000) {
    return {{"ok", false}, {"message", "波特率必须在 110 到 4000000 之间"}};
  }

  FrameDecoderConfig framing;
  std::string framingError;
  if (!parseFrameConfig(config, framing, framingError)) {
    return {{"ok", false}, {"message", framingError}};
  }

  close();
  baudRate_ = baudRate;
  frameDecoder_.configure(std::move(framing));

  std::string errorMessage;
  {
    std::scoped_lock lock(portMutex_);
    // CSerialPort 负责平台串口细节；这里保持协议配置到库配置的简单映射。
    port_.init(
      portName.c_str(),
      baudRate_,
      parseParity(parity),
      parseDataBits(dataBits),
      parseStopBits(stopBits),
      parseFlowControl(flowControl),
      static_cast<unsigned int>(std::max(readBuffer_.size(), FrameDecoder::kMaxFixedFrameBytes))
    );
    port_.setOperateMode(itas109::AsynchronousOperate);
    // A non-zero interval causes CSerialPort's Windows overlapped event wait
    // to time out before the receive event and prevents subsequent receives.
    // Zero waits for EV_RXCHAR and invokes the listener as soon as data lands.
    port_.setReadIntervalTimeout(0);
    port_.setMinByteReadNotify(1);
    // Deliver the smallest useful inbound packet instead of waiting for the
    // internal buffer to reach its default 80% threshold.
    port_.setByteReadBufferFullNotify(1);

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
  frameDecoder_.reset();
  portName_.clear();
  emitState("串口已关闭");
  return {{"ok", true}, {"message", "串口已关闭"}, {"state", stateJson()}};
}

Json SerialSession::sendPayload(const Json& payload) {
  if (!payload.is_object()) {
    return {{"ok", false}, {"message", "发送参数必须是 JSON 对象"}};
  }

  std::string mode;
  std::string data;
  std::string lineEnding;
  bool appendModbusCrc = false;
  try {
    mode = payload.value("mode", std::string("text"));
    data = payload.value("data", std::string());
    lineEnding = payload.value("lineEnding", std::string("none"));
    appendModbusCrc = payload.value("appendModbusCrc", false);
  } catch (const Json::type_error&) {
    return {{"ok", false}, {"message", "发送参数字段类型无效"}};
  }

  {
    std::scoped_lock lock(portMutex_);
    if (!port_.isOpen()) {
      return {{"ok", false}, {"message", "串口未打开"}};
    }
  }

  Bytes bytes;
  if (mode == "hex") {
    std::string error;
    if (!protocol::hexToBytes(data, bytes, error)) {
      return {{"ok", false}, {"message", error}};
    }
  } else {
    bytes = protocol::textToBytes(data, lineEnding);
  }

  if (appendModbusCrc) {
    protocol::appendModbusCrc(bytes);
  }

  if (bytes.empty()) {
    return {{"ok", false}, {"message", "发送内容为空"}};
  }
  if (bytes.size() > 1024 * 1024) {
    return {{"ok", false}, {"message", "单次发送不能超过 1 MiB"}};
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

bool SerialSession::parseFrameConfig(const Json& config, FrameDecoderConfig& framing, std::string& error) {
  framing = {};
  if (!config.contains("framing")) {
    return true;
  }

  const Json& source = config.at("framing");
  if (!source.is_object()) {
    error = "framing 必须是 JSON 对象";
    return false;
  }

  std::string mode;
  std::string delimiter;
  try {
    mode = source.value("mode", std::string("raw"));
    delimiter = source.value("delimiter", std::string("LF"));
  } catch (const Json::type_error&) {
    error = "framing 字段类型无效";
    return false;
  }

  if (mode == "raw") {
    return true;
  }
  if (mode == "fixed") {
    if (!source.contains("frameSize")
        || !(source.at("frameSize").is_number_integer() || source.at("frameSize").is_number_unsigned())) {
      error = "framing.frameSize 必须是整数";
      return false;
    }

    std::uint64_t frameSize = 0;
    try {
      if (source.at("frameSize").is_number_integer()) {
        const auto signedFrameSize = source.at("frameSize").get<std::int64_t>();
        if (signedFrameSize <= 0) {
          error = "framing.frameSize 必须在 1 到 131072 之间";
          return false;
        }
        frameSize = static_cast<std::uint64_t>(signedFrameSize);
      } else {
        frameSize = source.at("frameSize").get<std::uint64_t>();
      }
    } catch (const Json::exception&) {
      error = "framing.frameSize 必须是整数";
      return false;
    }

    if (frameSize == 0 || frameSize > FrameDecoder::kMaxFixedFrameBytes) {
      error = "framing.frameSize 必须在 1 到 131072 之间";
      return false;
    }
    framing.mode = FrameMode::Fixed;
    framing.frameSize = static_cast<std::size_t>(frameSize);
    return true;
  }
  if (mode != "delimiter") {
    error = "framing.mode 必须是 raw、delimiter 或 fixed";
    return false;
  }

  framing.mode = FrameMode::Delimiter;
  if (delimiter == "LF") framing.delimiter = {'\n'};
  else if (delimiter == "CR") framing.delimiter = {'\r'};
  else if (delimiter == "CRLF") framing.delimiter = {'\r', '\n'};
  else if (delimiter.rfind("HEX:", 0) == 0) {
    if (!protocol::hexToBytes(delimiter.substr(4), framing.delimiter, error)) {
      error = "framing HEX 分隔符无效：" + error;
      return false;
    }
  } else {
    error = "framing.delimiter 必须是 LF、CR、CRLF 或 HEX:<bytes>";
    return false;
  }

  if (framing.delimiter.empty()) {
    error = "framing 分隔符不能为空";
    return false;
  }
  return true;
}

void SerialSession::onReadEvent(const char*, unsigned int readBufferLen) {
  if (readBufferLen == 0) {
    return;
  }

  // CSerialPort reports the available bytes in its own ring buffer.  Drain
  // that notification in one read so a fixed frame larger than the former
  // 4 KiB scratch buffer cannot be overwritten before another EV_RXCHAR.
  Bytes bytes(std::min<std::size_t>(readBufferLen, FrameDecoder::kMaxFixedFrameBytes));
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
  FrameDecodeResult decoded = frameDecoder_.push(std::move(bytes));
  for (const auto& frame : decoded.frames) {
    rxFrames_ += 1;
    emitTransferEvent("rx", frame);
  }
  if (decoded.overflowed) {
    emitError("帧缓冲配置无效或分隔符帧缓冲超过 1 MiB，已丢弃未完成数据");
  }
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

void SerialSession::emitError(const std::string& message) {
  if (!eventHandler_) {
    return;
  }
  eventHandler_({
    {"type", "serial:error"},
    {"payload", {{"message", protocol::sanitizeUtf8(message)}}}
  });
}

void SerialSession::emitTransferEvent(const std::string& direction, const Bytes& bytes) {
  if (!eventHandler_) {
    return;
  }
  eventHandler_({
    {"type", "serial:" + direction},
    {"payload", {
      {"timestamp", protocol::utcTimestamp()},
      {"sequence", ++transferSequence_},
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
