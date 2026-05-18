# SAM custom build target for PlinthsAuthLayer.
#
# Why this exists:
#   SAM's `BuildMethod: python3.X` runs `pip install -r requirements.txt` into
#   the layer's `python/` build directory, but does NOT copy any source files
#   that already live under the layer's `python/` source directory. This layer
#   ships BOTH pip deps (PyJWT, cryptography) AND a hand-written module
#   (`plinths_auth`), so a custom build target copies the source first then
#   installs deps on top.
#
# Why the --platform / --only-binary flags:
#   `cryptography` has C extensions. Without these flags, pip on macOS pulls
#   a `*-darwin.so`, which crashes at import on Lambda's Linux runtime. Forcing
#   manylinux2014_x86_64 wheels guarantees Linux-compatible binaries regardless
#   of build host.
#
# CWD note:
#   SAM's CustomMakeBuilder copies the ContentUri into a scratch directory and
#   runs `make` from there. So `python/` and `requirements.txt` are local paths
#   relative to this Makefile's directory.
#
# Wired up by:
#   template.yaml → PlinthsAuthLayer.Metadata.BuildMethod: makefile

build-PlinthsAuthLayer:
	mkdir -p "$(ARTIFACTS_DIR)/python"
	cp -r python/. "$(ARTIFACTS_DIR)/python/"
	python3.13 -m pip install \
	    -r requirements.txt \
	    -t "$(ARTIFACTS_DIR)/python" \
	    --platform manylinux2014_x86_64 \
	    --implementation cp \
	    --python-version 3.13 \
	    --only-binary=:all: \
	    --upgrade
