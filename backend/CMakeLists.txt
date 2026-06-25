cmake_minimum_required(VERSION 3.24)

if (POLICY CMP0167)
  cmake_policy(SET CMP0167 OLD)
endif()

project(serialscope_native_backend LANGUAGES CXX)

if (DEFINED CMAKE_TOOLCHAIN_FILE)
  message(STATUS "Using toolchain: ${CMAKE_TOOLCHAIN_FILE}")
endif()

if (MSVC)
  set(CMAKE_CL_SHOWINCLUDES_PREFIX "注意: 包含文件:  ")
  set(CMAKE_CXX_CL_SHOWINCLUDES_PREFIX "注意: 包含文件:  ")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Boost REQUIRED COMPONENTS beast system)
find_package(cserialport CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)

add_executable(serialscope-backend
  src/main.cpp
  src/ProtocolUtils.cpp
  src/SerialSession.cpp
  src/WebSocketServer.cpp
)

target_compile_definitions(serialscope-backend PRIVATE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
  _WIN32_WINNT=0x0A00
)

target_include_directories(serialscope-backend PRIVATE
  src
  ${CSerialPort_INCLUDE_DIR}
)

if (MSVC)
  target_compile_options(serialscope-backend PRIVATE /utf-8 /permissive-)
endif()

target_link_libraries(serialscope-backend PRIVATE
  Boost::beast
  Boost::system
  ${CSerialPort_LIBRARY}
  nlohmann_json::nlohmann_json
  setupapi
  ws2_32
)
