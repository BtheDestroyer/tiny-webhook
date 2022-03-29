#include <iostream>

#ifndef COMMIT
#define COMMIT [Unknown Commit]
#endif
#define COMMIT_STR #COMMIT

int main()
{
    std::cout << "Hello, CI/CD!\n";
    std::cout << "I was compiled with commit " << COMMIT_STR << "!\n";
    return 0;
}
