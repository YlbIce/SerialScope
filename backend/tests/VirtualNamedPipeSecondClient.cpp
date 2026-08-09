#include <Windows.h>

#include <iostream>

int main(int argc, char* argv[]) {
  if (argc != 2) {
    std::cerr << "usage: serialscope-named-pipe-second-client <pipe-name>\n";
    return 10;
  }
  if (WaitNamedPipeA(argv[1], 250)) {
    std::cerr << "pipe unexpectedly accepted a second client\n";
    return 2;
  }
  const DWORD error = GetLastError();
  if (error != ERROR_SEM_TIMEOUT && error != ERROR_PIPE_BUSY) {
    std::cerr << "unexpected wait error: " << error << '\n';
    return 3;
  }
  std::cout << "busy\n";
  return 0;
}
