NAME=example
ROOT:=$(shell pwd)
BUILD_DIR:=$(ROOT)/build
OBJ_DIR:=$(BUILD_DIR)/obj
OUTPUT:=$(BUILD_DIR)/$(NAME)

SOURCE_DIR:=$(ROOT)/src

CXX:=g++
CXX_FLAGS:=-g -I$(SOURCE_DIR)\
			-Wall -Wextra\
			-std=c++2a\
			-O3
LINK_FLAGS:=

CPP_FILES:=$(wildcard $(SOURCE_DIR)/*.cpp)
OBJ_FILES:=$(patsubst $(SOURCE_DIR)/%.cpp, $(OBJ_DIR)/%.o,$(CPP_FILES))

.PHONY: all
all: $(OUTPUT)

.PHONY: clean
clean:
	rm -rf $(BUILD_DIR)

.PHONY: run
run: $(OUTPUT)
	$(OUTPUT)

$(OUTPUT): $(BUILD_DIR) $(OBJ_FILES)
	$(CXX) $(OBJ_FILES) $(LINK_FLAGS) -o$(OUTPUT)

$(OBJ_DIR)/%.o: $(SOURCE_DIR)/%.cpp $(OBJ_DIR)
	$(CXX) -c $(CXX_FLAGS) $< -o$@

$(OBJ_DIR):
	mkdir -p $@

$(BUILD_DIR):
	mkdir -p $@
