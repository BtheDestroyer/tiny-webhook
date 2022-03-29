#include <iostream>

#ifndef COMMIT
#define COMMIT [Unknown Commit]
#endif
#define STRINGIFY2(x) #x
#define STRINGIFY(x) STRINGIFY2(x)
#define COMMIT_STR STRINGIFY(COMMIT)

int main()
{
    std::cout << "Hello, CI/CD!\n";
    std::cout << "I was compiled with commit " << COMMIT_STR << "!\n";
    return 0;
}
