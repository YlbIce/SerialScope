#pragma once

#include "FrameDecoder.h"
#include "ProtocolUtils.h"

#include <array>
#include <chrono>
#include <functional>
#include <memory>
#include <mutex>
#include <string>

#include <boost/asio.hpp>
#include <CSerialPort/SerialPort.h>
#include <CSerialPort/SerialPortListener.h>

class SerialSession final : public std::enable_shared_from_this<SerialSession>, private itas109::CSerialPortListener {
public:
  using EventHandler = std::function<void(protocol::Json)>;

  explicit SerialSession(boost::asio::io_context& io);

  void setEventHandler(EventHandler handler);
  protocol::Json stateJson() const;
  protocol::Json open(const protocol::Json& config);
  protocol::Json close();
  protocol::Json sendPayload(const protocol::Json& payload);

private:
  static itas109::DataBits parseDataBits(int value);
  static itas109::Parity parseParity(const std::string& value);
  static itas109::StopBits parseStopBits(const std::string& value);
  static itas109::FlowControl parseFlowControl(const std::string& value);
  static bool parseFrameConfig(const protocol::Json& config, FrameDecoderConfig& framing, std::string& error);

  void onReadEvent(const char* portName, unsigned int readBufferLen) override;
  void handleReceived(protocol::Bytes bytes);
  void emitState(const std::string& message = {});
  void emitError(const std::string& message);
  void emitTransferEvent(const std::string& direction, const protocol::Bytes& bytes);
  std::string lastErrorMessage() const;

  boost::asio::io_context& io_;
  mutable itas109::CSerialPort port_;
  mutable std::mutex portMutex_;
  EventHandler eventHandler_;
  FrameDecoder frameDecoder_;
  std::array<std::uint8_t, 4096> readBuffer_ {};
  std::string portName_;
  std::string lastPortName_;
  int baudRate_ = 115200;
  std::uint64_t rxBytes_ = 0;
  std::uint64_t txBytes_ = 0;
  std::uint64_t rxFrames_ = 0;
  std::uint64_t txFrames_ = 0;
  std::uint64_t transferSequence_ = 0;
  std::chrono::steady_clock::time_point startTime_ = std::chrono::steady_clock::now();
};

protocol::Json listSerialPorts();
