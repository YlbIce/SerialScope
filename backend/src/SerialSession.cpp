#include "SerialSession.h"

#include <algorithm>
#include <iomanip>
#include <sstream>
#include <utility>

#include <Windows.h>
#include <SetupAPI.h>
#include <devguid.h>
#include <regstr.h>

namespace asio = boost::asio;
using protocol::Bytes;
using protocol::Json;

namespace {

std::string narrow(const std::wstring& value) {
  if (value.empty()) {
    return {};
  }
  const int length = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string result(length, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), length, nullptr, nullptr);
  return result;
}

std::wstring readDeviceRegistryString(HDEVINFO devices, SP_DEVINFO_DATA& data, DWORD property) {
  DWORD type = 0;
  WCHAR buffer[512] = {};
  if (!SetupDiGetDeviceRegistryPropertyW(devices, &data, property, &type, reinterpret_cast<PBYTE>(buffer), sizeof(buffer), nullptr)) {
    return {};
  }
  return buffer;
}

std::string readPortName(HDEVINFO devices, SP_DEVINFO_DATA& data) {
  HKEY key = SetupDiOpenDevRegKey(devices, &data, DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
  if (key == INVALID_HANDLE_VALUE) {
    return {};
  }

  WCHAR buffer[256] = {};
  DWORD size = sizeof(buffer);
  DWORD type = 0;
  const LONG rc = RegQueryValueExW(key, L"PortName", nullptr, &type, reinterpret_cast<LPBYTE>(buffer), &size);
  RegCloseKey(key);
  if (rc != ERROR_SUCCESS || type != REG_SZ) {
    return {};
  }
  return narrow(buffer);
}

std::string systemLocationFor(const std::string& portName) {
  if (portName.rfind("COM", 0) == 0 && portName.size() > 4) {
    return "\\\\.\\" + portName;
  }
  return portName;
}

std::string boostErrorMessage(const boost::system::error_code& ec) {
  return ec.message();
}

} // namespace

SerialSession::SerialSession(asio::io_context& io)
  : io_(io),
    port_(io) {
}

void SerialSession::setEventHandler(EventHandler handler) {
  eventHandler_ = std::move(handler);
}

Json SerialSession::stateJson() const {
  const auto uptimeMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::steady_clock::now() - startTime_
  ).count();

  return {
    {"isOpen", port_.is_open()},
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

  const std::string parity = config.value("parity", "none");
  if (parity == "mark" || parity == "space") {
    return {{"ok", false}, {"message", "当前非 Qt 后端基于 Boost.Asio，暂不支持 Mark/Space 校验位"}};
  }

  boost::system::error_code ec;
  port_.open(systemLocationFor(portName), ec);
  if (ec) {
    const std::string message = "打开串口失败：" + boostErrorMessage(ec);
    emitState(message);
    return {{"ok", false}, {"message", message}};
  }

  baudRate_ = config.value("baudRate", 115200);
  port_.set_option(asio::serial_port_base::baud_rate(baudRate_), ec);
  if (!ec) port_.set_option(parseDataBits(config.value("dataBits", 8)), ec);
  if (!ec) port_.set_option(parseParity(parity), ec);
  if (!ec) port_.set_option(parseStopBits(config.value("stopBits", "1")), ec);
  if (!ec) port_.set_option(parseFlowControl(config.value("flowControl", "none")), ec);

  if (ec) {
    const std::string message = "配置串口失败：" + boostErrorMessage(ec);
    close();
    return {{"ok", false}, {"message", message}};
  }

  // 串口配置成功后再重置统计，避免打开失败时破坏前端已有状态。
  portName_ = portName;
  lastPortName_ = portName;
  rxBytes_ = 0;
  txBytes_ = 0;
  rxFrames_ = 0;
  txFrames_ = 0;
  startTime_ = std::chrono::steady_clock::now();
  startRead();
  emitState("串口已打开");
  return {{"ok", true}, {"message", "串口已打开"}, {"state", stateJson()}};
}

Json SerialSession::close() {
  boost::system::error_code ignored;
  if (port_.is_open()) {
    port_.cancel(ignored);
    port_.close(ignored);
  }
  portName_.clear();
  emitState("串口已关闭");
  return {{"ok", true}, {"message", "串口已关闭"}, {"state", stateJson()}};
}

Json SerialSession::sendPayload(const Json& payload) {
  if (!port_.is_open()) {
    return {{"ok", false}, {"message", "串口未打开"}};
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

  boost::system::error_code ec;
  const std::size_t written = asio::write(port_, asio::buffer(bytes), ec);
  if (ec) {
    return {{"ok", false}, {"message", "写入失败：" + boostErrorMessage(ec)}};
  }

  Bytes sent(bytes.begin(), bytes.begin() + static_cast<std::ptrdiff_t>(written));
  txBytes_ += written;
  txFrames_ += 1;
  emitTransferEvent("tx", sent);
  emitState();
  return {{"ok", true}, {"bytes", written}, {"state", stateJson()}};
}

asio::serial_port_base::character_size SerialSession::parseDataBits(int value) {
  return asio::serial_port_base::character_size(static_cast<unsigned int>(std::clamp(value, 5, 8)));
}

asio::serial_port_base::parity SerialSession::parseParity(const std::string& value) {
  if (value == "even") return asio::serial_port_base::parity(asio::serial_port_base::parity::even);
  if (value == "odd") return asio::serial_port_base::parity(asio::serial_port_base::parity::odd);
  return asio::serial_port_base::parity(asio::serial_port_base::parity::none);
}

asio::serial_port_base::stop_bits SerialSession::parseStopBits(const std::string& value) {
  if (value == "1.5") return asio::serial_port_base::stop_bits(asio::serial_port_base::stop_bits::onepointfive);
  if (value == "2") return asio::serial_port_base::stop_bits(asio::serial_port_base::stop_bits::two);
  return asio::serial_port_base::stop_bits(asio::serial_port_base::stop_bits::one);
}

asio::serial_port_base::flow_control SerialSession::parseFlowControl(const std::string& value) {
  if (value == "hardware") return asio::serial_port_base::flow_control(asio::serial_port_base::flow_control::hardware);
  if (value == "software") return asio::serial_port_base::flow_control(asio::serial_port_base::flow_control::software);
  return asio::serial_port_base::flow_control(asio::serial_port_base::flow_control::none);
}

void SerialSession::startRead() {
  if (!port_.is_open()) {
    return;
  }

  auto self = shared_from_this();
  port_.async_read_some(asio::buffer(readBuffer_), [this, self](const boost::system::error_code& ec, std::size_t size) {
    if (ec) {
      if (ec != asio::error::operation_aborted && eventHandler_) {
        eventHandler_({
          {"type", "serial:error"},
          {"payload", {{"message", "读取失败：" + boostErrorMessage(ec)}, {"code", ec.value()}}}
        });
      }
      return;
    }

    Bytes bytes(readBuffer_.begin(), readBuffer_.begin() + static_cast<std::ptrdiff_t>(size));
    rxBytes_ += bytes.size();
    rxFrames_ += 1;
    emitTransferEvent("rx", bytes);
    emitState();
    startRead();
  });
}

void SerialSession::emitState(const std::string& message) {
  if (!eventHandler_) {
    return;
  }
  Json payload = stateJson();
  if (!message.empty()) {
    payload["message"] = message;
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

Json listSerialPorts() {
  Json ports = Json::array();

  HDEVINFO devices = SetupDiGetClassDevsW(&GUID_DEVCLASS_PORTS, nullptr, nullptr, DIGCF_PRESENT);
  if (devices == INVALID_HANDLE_VALUE) {
    return {{"ports", ports}};
  }

  for (DWORD index = 0;; ++index) {
    SP_DEVINFO_DATA data {};
    data.cbSize = sizeof(data);
    if (!SetupDiEnumDeviceInfo(devices, index, &data)) {
      break;
    }

    const std::string portName = readPortName(devices, data);
    if (portName.empty()) {
      continue;
    }

    const std::string description = narrow(readDeviceRegistryString(devices, data, SPDRP_FRIENDLYNAME));
    const std::string manufacturer = narrow(readDeviceRegistryString(devices, data, SPDRP_MFG));
    ports.push_back({
      {"portName", portName},
      {"systemLocation", systemLocationFor(portName)},
      {"description", description},
      {"manufacturer", manufacturer},
      {"serialNumber", ""},
      {"vendorId", ""},
      {"productId", ""}
    });
  }

  SetupDiDestroyDeviceInfoList(devices);
  return {{"ports", ports}};
}
