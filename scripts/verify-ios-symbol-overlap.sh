#!/bin/bash
# Fails when two static archives both define a symbol, weak or strong, unless
# every global-scope name in it is std::, JSI/React or a builtin, or it is a
# clang block helper or an ObjC protocol record.
# Both archives link into one executable, where hidden visibility does not keep
# two definitions apart: the linker keeps one of each pair, with at most a
# warning.
set -uo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <a.a> <b.a>" >&2
  exit 64
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# One "<name>\t<binding>\t<nm line>" per defined symbol that is not
# non-external. A binding this does not know is kept.
external_symbols() {
  nm -m -U "$1" >"$tmp/nm" || return 1
  awk '
    function strip_annotations(s,   start, span) {
      while ((start = index(s, "[")) > 0 && (span = index(substr(s, start), "]")) > 0) {
        s = substr(s, 1, start - 1) substr(s, start + span)
      }
      return s
    }
    /^[[:space:]]*$/ || /:$/ { next }
    {
      line = $0
      sub(/^[0-9a-fA-F]+ /, "", line)
      sub(/^\([^)]*\) /, "", line)
      name = $NF
      binding = strip_annotations(substr(line, 1, length(line) - length(name)))
      gsub(/[[:space:]]+/, " ", binding)
      sub(/^ /, "", binding)
      sub(/ $/, "", binding)
      if (binding ~ /^non-external/ || name in seen) next
      seen[name] = 1
      print name "\t" binding "\t" $0
    }
  ' "$tmp/nm"
}

for side in a b; do
  archive=$1
  shift
  if ! external_symbols "$archive" >"$tmp/$side"; then
    echo "FAIL nm could not read $archive" >&2
    exit 1
  fi
  if [ ! -s "$tmp/$side" ]; then
    echo "FAIL no external symbols in $archive" >&2
    exit 1
  fi
done

awk -F '\t' 'NR == FNR { bind[$1] = $2; raw[$1] = $3; next }
  $1 in bind { print $1 "\t" bind[$1] "\t" $2 "\t" raw[$1] "\t" $3 }' \
  "$tmp/a" "$tmp/b" >"$tmp/shared"

# Mach-O adds one leading underscore to every name; -n keeps c++filt from
# stripping a second one, which would leave C++ names mangled.
cut -f 1 "$tmp/shared" | sed 's/^_//' | c++filt -n >"$tmp/demangled" || {
  echo "FAIL c++filt could not demangle the shared names" >&2
  exit 1
}
if [ "$(wc -l <"$tmp/demangled")" -ne "$(wc -l <"$tmp/shared")" ]; then
  echo "FAIL c++filt returned a different number of names" >&2
  exit 1
fi

paste "$tmp/demangled" "$tmp/shared" | awk -F '\t' '
  BEGIN {
    split("construction vtable for |vtable for |VTT for |typeinfo name for |typeinfo for |guard variable for |virtual thunk to |non-virtual thunk to ", descriptor, "|")
    split("__block_descriptor_ __copy_helper_block_ __destroy_helper_block_ _OBJC_PROTOCOL_$_ _OBJC_LABEL_PROTOCOL_$_", compiler_record, " ")
    split("void bool char wchar_t char8_t char16_t char32_t short int long signed unsigned float double __int128 const volatile operator new delete true false nullptr decltype auto noexcept __mbstate_t __clang_call_terminate", global, " ")
    for (i in global) global_name[global[i]] = 1
  }
  function drop_abi_tags(s,   start, span) {
    while ((start = index(s, "[abi:")) > 0 && (span = index(substr(s, start), "]")) > 0) {
      s = substr(s, 1, start - 1) substr(s, start + span)
    }
    return s
  }
  function allowed(name,   s, i, n, start, word, rest) {
    if (tolower(name) ~ /ggml|whisper|llama|dl_/) return 0
    for (i in compiler_record) if (index(name, compiler_record[i]) == 1) return 1
    s = name
    for (i = 1; i in descriptor; i++) {
      if (index(s, descriptor[i]) != 1) continue
      s = substr(s, length(descriptor[i]) + 1)
      if (descriptor[i] == "construction vtable for ") sub(/-in-/, " ", s)
      break
    }
    s = drop_abi_tags(s)
    n = length(s)
    for (i = 1; i <= n;) {
      if (substr(s, i, 1) ~ /[0-9]/) {
        while (i <= n && substr(s, i, 1) ~ /[0-9A-Za-z_]/) i++
        continue
      }
      if (substr(s, i, 1) !~ /[A-Za-z_$]/) { i++; continue }
      start = i
      while (i <= n && substr(s, i, 1) ~ /[0-9A-Za-z_$]/) i++
      if (substr(s, 1, start - 1) ~ /::~?$/) continue
      word = substr(s, start, i - start)
      rest = substr(s, i)
      if (index(rest, "::") != 1) {
        if (!(word in global_name)) return 0
      } else if (word != "std" &&
        !(word == "facebook" && (index(rest, "::jsi::") == 1 || index(rest, "::react::") == 1))) {
        return 0
      }
    }
    return 1
  }
  {
    verdict = allowed($1) ? "ALLOW" : "DENY"
    if (verdict == "DENY") denied++
    print verdict " " $3 " / " $4 " " $1
    print "  " $5
    print "  " $6
  }
  END {
    print NR " shared, " denied + 0 " denied"
    exit denied > 0
  }
'
