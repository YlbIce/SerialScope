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

find_package(Boost REQUIRED COMPONENTS system)
find_package(nlohmann_json CONFIG REQUIRED)

# CSerialPort v5 replaces the vcpkg 4.3.3 package, which could open but did
# not exchange data with the ELTIMA virtual COM pair in this application.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "Build static libraries" FORCE)
set(CSERIALPORT_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(CSERIALPORT_BUILD_BINDING_C OFF CACHE BOOL "" FORCE)
set(CSERIALPORT_BUILD_DOC OFF CACHE BOOL "" FORCE)
set(CSERIALPORT_BUILD_TEST OFF CACHE BOOL "" FORCE)
set(CSERIALPORT_ENABLE_DEBUG OFF CACHE BOOL "" FORCE)
set(CSERIALPORT_ENABLE_NATIVE_SYNC OFF CACHE BOOL "" FORCE)
add_subdirectory(vendor/CSerialPort EXCLUDE_FROM_ALL)

add_executable(serialscope-backend
  src/main.cpp
  src/FrameDecoder.cpp
  src/ProtocolUtils.cpp
  src/SerialSession.cpp
  src/NamedPipeServer.cpp
)

target_compile_definitions(serialscope-backend PRIVATE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
  _WIN32_WINNT=0x0A00
)

target_include_directories(serialscope-backend PRIVATE
  src
  vendor/CSerialPort/include
)

if (MSVC)
  target_compile_options(serialscope-backend PRIVATE /utf-8 /permissive-)
endif()

target_link_libraries(serialscope-backend PRIVATE
  Boost::system
  libcserialport
  nlohmann_json::nlohmann_json
  setupapi
  advapi32
)
set_target_properties(serialscope-backend PROPERTIES
  CXX_STANDARD 20
  CXX_STANDARD_REQUIRED ON
)

add_executable(serialscope-frame-decoder-tests
  tests/FrameDecoderTests.cpp
  src/FrameDecoder.cpp
  src/ProtocolUtils.cpp
)

target_compile_definitions(serialscope-frame-decoder-tests PRIVATE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
)

target_include_directories(serialscope-frame-decoder-tests PRIVATE src)

if (MSVC)
  target_compile_options(serialscope-frame-decoder-tests PRIVATE /utf-8 /permissive-)
endif()

target_link_libraries(serialscope-frame-decoder-tests PRIVATE
  nlohmann_json::nlohmann_json
)

add_executable(serialscope-virtual-serial-writer tests/VirtualSerialWriter.cpp)
add_executable(serialscope-virtual-serial-reader tests/VirtualSerialReader.cpp)
add_executable(serialscope-virtual-serial-roundtrip tests/VirtualSerialRoundTrip.cpp)
add_executable(serialscope-virtual-serial-responder tests/VirtualSerialResponder.cpp)
add_executable(serialscope-named-pipe-slow-client tests/VirtualNamedPipeSlowClient.cpp)
add_executable(serialscope-named-pipe-second-client tests/VirtualNamedPipeSecondClient.cpp)

if (MSVC)
  target_compile_options(serialscope-virtual-serial-writer PRIVATE /utf-8 /permissive-)
  target_compile_options(serialscope-virtual-serial-reader PRIVATE /utf-8 /permissive-)
  target_compile_options(serialscope-virtual-serial-roundtrip PRIVATE /utf-8 /permissive-)
  target_compile_options(serialscope-virtual-serial-responder PRIVATE /utf-8 /permissive-)
  target_compile_options(serialscope-named-pipe-slow-client PRIVATE /utf-8 /permissive-)
  target_compile_options(serialscope-named-pipe-second-client PRIVATE /utf-8 /permissive-)
endif()
