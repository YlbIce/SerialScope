#pragma once

#include "ProtocolUtils.h"

#include <array>
#include <chrono>
#include <functional>
#include <memory>
#include <string>

#include <boost/asio.hpp>

class SerialSession final : public std::enable_shared_from_this<SerialSession> {
public:
  using EventHandler = std::function<void(protocol::Json)>;

  explicit SerialSession(boost::asio::io_context& io);

  void setEventHandler(EventHandler handler);
  protocol::Json stateJson() const;
  protocol::Json open(const protocol::Json& config);
  protocol::Json close();
  protocol::Json sendPayload(const protocol::Json& payload);

private:
  static boost::asio::serial_port_base::character_size parseDataBits(int value);
  static boost::asio::serial_port_base::parity parseParity(const std::string& value);
  static boost::asio::serial_port_base::stop_bits parseStopBits(const std::string& value);
  static boost::asio::serial_port_base::flow_control parseFlowControl(const std::string& value);

  void startRead();
  void emitState(const std::string& message = {});
  void emitTransferEvent(const std::string& direction, const protocol::Bytes& bytes);

  boost::asio::io_context& io_;
  boost::asio::serial_port port_;
  EventHandler eventHandler_;
  std::array<std::uint8_t, 4096> readBuffer_ {};
  std::string portName_;
  std::string lastPortName_;
  int baudRate_ = 115200;
  std::uint64_t rxBytes_ = 0;
  std::uint64_t txBytes_ = 0;
  std::uint64_t rxFrames_ = 0;
  std::uint64_t txFrames_ = 0;
  std::chrono::steady_clock::time_point startTime_ = std::chrono::steady_clock::now();
};

protocol::Json listSerialPorts();
