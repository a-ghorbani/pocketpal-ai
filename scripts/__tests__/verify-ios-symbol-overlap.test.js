const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'verify-ios-symbol-overlap.sh');

const fixtures = [];

const symbol = (a, b, demangled, members = ['rn-llama.o', 'rn-whisper.o']) => {
  const fixture = {a, b, demangled, members};
  fixtures.push(fixture);
  return fixture;
};

const nmLine = (address, binding, name, section = '(__TEXT,__text)') =>
  `${address} ${section} ${binding} ${name}`;

const both = line => ({
  a: line,
  b: line,
  members: ['rn-llama.o', 'rn-whisper.o'],
});

const sym = (address, binding, name, demangled, section) => {
  const line = nmLine(address, binding, name, section);
  return symbol(line, line, demangled);
};

// Copied verbatim from the nm and c++filt output of a CI build.
const STD_FUNCTION = symbol(
  '00000000000059cc (__TEXT,__text) weak private external __ZSt28__throw_bad_array_new_lengthB9nqe210106v',
  '00000000000088d4 (__TEXT,__text) weak private external __ZSt28__throw_bad_array_new_lengthB9nqe210106v',
  'std::__throw_bad_array_new_length[abi:nqe210106]()',
);
const JSI = symbol(
  '0000000000008c7c (__TEXT,__text) weak private external __ZN8facebook3jsi7JSErrorC1ERNS0_8IRuntimeEPKc',
  '0000000000006e58 (__TEXT,__text) weak private external __ZN8facebook3jsi7JSErrorC1ERNS0_8IRuntimeEPKc',
  'facebook::jsi::JSError::JSError(facebook::jsi::IRuntime&, char const*)',
);
const REACT_IN_STD = symbol(
  '0000000000000878 (__TEXT,__text) weak private external __ZNSt3__110shared_ptrIN8facebook5react11CallInvokerEED1B9nqe210106Ev',
  '0000000000001c54 (__TEXT,__text) weak private external __ZNSt3__110shared_ptrIN8facebook5react11CallInvokerEED1B9nqe210106Ev',
  'std::__1::shared_ptr<facebook::react::CallInvoker>::~shared_ptr[abi:nqe210106]()',
);
const TERMINATE = symbol(
  '0000000000000d24 (__TEXT,__text) weak private external ___clang_call_terminate',
  '0000000000001a78 (__TEXT,__text) weak private external ___clang_call_terminate',
  '__clang_call_terminate',
);
const THREAD_POOL = symbol(
  '00000000000000c4 (__TEXT,__text) external __ZN10ThreadPoolC2Em',
  '0000000000004ae4 (__TEXT,__text) weak private external __ZN10ThreadPoolC2Em',
  'ThreadPool::ThreadPool(unsigned long)',
);
const STD_DESTRUCTOR = symbol(
  '000000000000420c (__TEXT,__text) weak private external __ZNSt3__117bad_function_callD0Ev',
  '000000000000ac28 (__TEXT,__text) weak private external __ZNSt3__117bad_function_callD0Ev',
  'std::__1::bad_function_call::~bad_function_call()',
);
const STD_VTABLE = symbol(
  '00000000000124a0 (__DATA,__const) weak external automatically hidden __ZTVNSt3__117bad_function_callE',
  '0000000000014fe8 (__DATA,__const) weak external automatically hidden __ZTVNSt3__117bad_function_callE',
  'vtable for std::__1::bad_function_call',
);
const STD_TYPEINFO = symbol(
  '0000000000012488 (__DATA,__const) weak private external __ZTINSt3__117bad_function_callE',
  '0000000000014fd0 (__DATA,__const) weak private external __ZTINSt3__117bad_function_callE',
  'typeinfo for std::__1::bad_function_call',
);
const STD_TYPEINFO_NAME = symbol(
  '0000000000011194 (__TEXT,__const) weak private external __ZTSNSt3__117bad_function_callE',
  '0000000000015518 (__TEXT,__const) weak private external __ZTSNSt3__117bad_function_callE',
  'typeinfo name for std::__1::bad_function_call',
);
const STD_OVER_SYSTEM_TYPEDEF = symbol(
  '000000000002e640 (__TEXT,__text) weak external automatically hidden __ZNSt3__113basic_filebufIcNS_11char_traitsIcEEE7seekposENS_4fposI11__mbstate_tEEj',
  '000000000000b574 (__TEXT,__text) weak private external __ZNSt3__113basic_filebufIcNS_11char_traitsIcEEE7seekposENS_4fposI11__mbstate_tEEj',
  'std::__1::basic_filebuf<char, std::__1::char_traits<char>>::seekpos(std::__1::fpos<__mbstate_t>, unsigned int)',
);
const RETURNS_VOID = symbol(
  '0000000000011828 (__TEXT,__text) weak private external __ZNSt3__113__tree_removeB9nqe210106IPNS_16__tree_node_baseIPvEEEEvT_S5_',
  '00000000000224ac (__TEXT,__text) weak private external __ZNSt3__113__tree_removeB9nqe210106IPNS_16__tree_node_baseIPvEEEEvT_S5_',
  'void std::__1::__tree_remove[abi:nqe210106]<std::__1::__tree_node_base<void*>*>(std::__1::__tree_node_base<void*>*, std::__1::__tree_node_base<void*>*)',
);
const RETURNS_UNSIGNED_INT = symbol(
  '000000000001808c (__TEXT,__text) weak external automatically hidden __ZNKSt3__112regex_traitsIcE18__lookup_classnameIPKcEEjT_S5_bc',
  '0000000000034d94 (__TEXT,__text) weak private external __ZNKSt3__112regex_traitsIcE18__lookup_classnameIPKcEEjT_S5_bc',
  'unsigned int std::__1::regex_traits<char>::__lookup_classname<char const*>(char const*, char const*, bool, char) const',
);
const RETURNS_CHAR_POINTER = symbol(
  '0000000000012010 (__TEXT,__text) weak external automatically hidden __ZNSt3__111basic_regexIcNS_12regex_traitsIcEEE12__parse_atomIPKcEET_S7_S7_',
  '0000000000032b80 (__TEXT,__text) weak private external __ZNSt3__111basic_regexIcNS_12regex_traitsIcEEE12__parse_atomIPKcEET_S7_S7_',
  'char const* std::__1::basic_regex<char, std::__1::regex_traits<char>>::__parse_atom<char const*>(char const*, char const*)',
);
const RETURNS_BOOL = symbol(
  '0000000000016e4c (__TEXT,__text) weak private external __ZNSt3__111regex_matchB9nqe210106INS_11__wrap_iterIPKcEEcNS_12regex_traitsIcEEEEbT_S7_RKNS_11basic_regexIT0_T1_EENS_15regex_constants15match_flag_typeE',
  '000000000003582c (__TEXT,__text) weak private external __ZNSt3__111regex_matchB9nqe210106INS_11__wrap_iterIPKcEEcNS_12regex_traitsIcEEEEbT_S7_RKNS_11basic_regexIT0_T1_EENS_15regex_constants15match_flag_typeE',
  'bool std::__1::regex_match[abi:nqe210106]<std::__1::__wrap_iter<char const*>, char, std::__1::regex_traits<char>>(std::__1::__wrap_iter<char const*>, std::__1::__wrap_iter<char const*>, std::__1::basic_regex<char, std::__1::regex_traits<char>> const&, std::__1::regex_constants::match_flag_type)',
);
const RETURNS_LONG_WITH_LITERALS = symbol(
  '000000000000466c (__TEXT,__text) weak private external __ZNSt3__124uniform_int_distributionIlEclINS_23mersenne_twister_engineIjLm32ELm624ELm397ELm31ELj2567483615ELm11ELj4294967295ELm7ELj2636928640ELm15ELj4022730752ELm18ELj1812433253EEEEElRT_RKNS1_10param_typeE',
  '000000000000466c (__TEXT,__text) weak private external __ZNSt3__124uniform_int_distributionIlEclINS_23mersenne_twister_engineIjLm32ELm624ELm397ELm31ELj2567483615ELm11ELj4294967295ELm7ELj2636928640ELm15ELj4022730752ELm18ELj1812433253EEEEElRT_RKNS1_10param_typeE',
  'long std::__1::uniform_int_distribution<long>::operator()<std::__1::mersenne_twister_engine<unsigned int, 32ul, 624ul, 397ul, 31ul, 2567483615u, 11ul, 4294967295u, 7ul, 2636928640u, 15ul, 4022730752u, 18ul, 1812433253u>>(std::__1::mersenne_twister_engine<unsigned int, 32ul, 624ul, 397ul, 31ul, 2567483615u, 11ul, 4294967295u, 7ul, 2636928640u, 15ul, 4022730752u, 18ul, 1812433253u>&, std::__1::uniform_int_distribution<long>::param_type const&)',
);
const ENUM_TEMPLATE_ARGUMENT = symbol(
  '0000000000014020 (__TEXT,__text) weak private external __ZNSt3__119__throw_regex_errorB9nqe210106ILNS_15regex_constants10error_typeE11EEEvv',
  '00000000000266cc (__TEXT,__text) weak private external __ZNSt3__119__throw_regex_errorB9nqe210106ILNS_15regex_constants10error_typeE11EEEvv',
  'void std::__1::__throw_regex_error[abi:nqe210106]<(std::__1::regex_constants::error_type)11>()',
);
const JSI_RETURNS_VOID = symbol(
  '0000000000039b6c (__TEXT,__text) weak external automatically hidden __ZNK8facebook3jsi6Object11setPropertyINS0_5ArrayEEEvRNS0_8IRuntimeEPKcOT_',
  '0000000000016104 (__TEXT,__text) weak external automatically hidden __ZNK8facebook3jsi6Object11setPropertyINS0_5ArrayEEEvRNS0_8IRuntimeEPKcOT_',
  'void facebook::jsi::Object::setProperty<facebook::jsi::Array>(facebook::jsi::IRuntime&, char const*, facebook::jsi::Array&&) const',
);
const VIRTUAL_THUNK = symbol(
  '000000000002e0f0 (__TEXT,__text) weak private external __ZTv0_n24_NSt3__114basic_ifstreamIcNS_11char_traitsIcEEED0Ev',
  '000000000000b0ac (__TEXT,__text) weak private external __ZTv0_n24_NSt3__114basic_ifstreamIcNS_11char_traitsIcEEED0Ev',
  'virtual thunk to std::__1::basic_ifstream<char, std::__1::char_traits<char>>::~basic_ifstream()',
);
const CONSTRUCTION_VTABLE = symbol(
  '000000000003ec98 (__DATA,__const) weak external automatically hidden __ZTCNSt3__114basic_ifstreamIcNS_11char_traitsIcEEEE0_NS_13basic_istreamIcS2_EE',
  '0000000000015080 (__DATA,__const) weak external automatically hidden __ZTCNSt3__114basic_ifstreamIcNS_11char_traitsIcEEEE0_NS_13basic_istreamIcS2_EE',
  'construction vtable for std::__1::basic_istream<char, std::__1::char_traits<char>>-in-std::__1::basic_ifstream<char, std::__1::char_traits<char>>',
);
const VTT = symbol(
  '000000000003ec78 (__DATA,__const) weak external automatically hidden __ZTTNSt3__114basic_ifstreamIcNS_11char_traitsIcEEEE',
  '0000000000015060 (__DATA,__const) weak external automatically hidden __ZTTNSt3__114basic_ifstreamIcNS_11char_traitsIcEEEE',
  'VTT for std::__1::basic_ifstream<char, std::__1::char_traits<char>>',
);
const BLOCK_DESCRIPTOR = symbol(
  '0000000000006ab8 (__DATA,__const) weak private external ___block_descriptor_40_e8_32o_e28_v16\u0001?0\u0001"<MTLCommandBuffer>"8l',
  '00000000000064b0 (__DATA,__const) weak private external ___block_descriptor_40_e8_32o_e28_v16\u0001?0\u0001"<MTLCommandBuffer>"8l',
  '__block_descriptor_40_e8_32o_e28_v16\u0001?0\u0001"<MTLCommandBuffer>"8l',
);
const COPY_HELPER = symbol(
  '0000000000004034 (__TEXT,__text) weak private external ___copy_helper_block_e8_32o',
  '0000000000003c04 (__TEXT,__text) weak private external ___copy_helper_block_e8_32o',
  '__copy_helper_block_e8_32o',
);
const DESTROY_HELPER = symbol(
  '0000000000004044 (__TEXT,__text) weak private external ___destroy_helper_block_e8_32o',
  '0000000000003c14 (__TEXT,__text) weak private external ___destroy_helper_block_e8_32o',
  '__destroy_helper_block_e8_32o',
);
const OBJC_PROTOCOL = symbol(
  '0000000000000ca0 (__DATA,__data) weak private external [no dead strip] __OBJC_PROTOCOL_$_NSObject',
  '0000000000002b90 (__DATA,__data) weak private external [no dead strip] __OBJC_PROTOCOL_$_NSObject',
  '_OBJC_PROTOCOL_$_NSObject',
);
const OBJC_LABEL_PROTOCOL = symbol(
  '0000000000001b90 (__DATA,__objc_protolist) weak private external [no dead strip] __OBJC_LABEL_PROTOCOL_$_RCTBridgeModule',
  '0000000000003af0 (__DATA,__objc_protolist) weak private external [no dead strip] __OBJC_LABEL_PROTOCOL_$_RCTBridgeModule',
  '_OBJC_LABEL_PROTOCOL_$_RCTBridgeModule',
);
const NODE_INFO_RESERVE = symbol(
  '00000000000012c0 (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEE7reserveEm',
  '0000000000001450 (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEE7reserveEm',
  'std::__1::vector<node_info, std::__1::allocator<node_info>>::reserve(unsigned long)',
);
const NODE_INFO_EMPLACE = symbol(
  '00000000000014f4 (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEE24__emplace_back_slow_pathIJS1_EEEPS1_DpOT_',
  '0000000000001684 (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEE24__emplace_back_slow_pathIJS1_EEEPS1_DpOT_',
  'node_info* std::__1::vector<node_info, std::__1::allocator<node_info>>::__emplace_back_slow_path<node_info>(node_info&&)',
);
const CMP_TOP_K_SORT = symbol(
  '000000000003d3dc (__TEXT,__text) weak private external __ZNSt3__119__partial_sort_implB9nqe210106INS_17_ClassicAlgPolicyER9cmp_top_kPiS4_EET1_S5_S5_T2_OT0_',
  '000000000003a144 (__TEXT,__text) weak private external __ZNSt3__119__partial_sort_implB9nqe210106INS_17_ClassicAlgPolicyER9cmp_top_kPiS4_EET1_S5_S5_T2_OT0_',
  'int* std::__1::__partial_sort_impl[abi:nqe210106]<std::__1::_ClassicAlgPolicy, cmp_top_k&, int*, int*>(int*, int*, int*, cmp_top_k&)',
);

// Copied verbatim from nm on a device build without whisper.rn's renames.
const DL_LOAD = symbol(
  '0000000000000000 (__TEXT,__text) external __Z15dl_load_libraryRKNSt3__14__fs10filesystem4pathE',
  '0000000000000000 (__TEXT,__text) private external __Z15dl_load_libraryRKNSt3__14__fs10filesystem4pathE',
  'dl_load_library(std::__1::__fs::filesystem::path const&)',
  ['ggml-backend-dl.o', 'ggml-backend-dl.o'],
);
const EXTRA_BUFFER_TYPE_COLD_DTOR = symbol(
  '0000000000000014 (__TEXT,__text) external [cold func] __ZN4ggml3cpu17extra_buffer_typeD0Ev',
  '0000000000000014 (__TEXT,__text) private external [cold func] __ZN4ggml3cpu17extra_buffer_typeD0Ev',
  'ggml::cpu::extra_buffer_type::~extra_buffer_type()',
  ['traits.o', 'traits.o'],
);
const EXTRA_BUFFER_TYPE_DTOR = symbol(
  '000000000000000c (__TEXT,__text) external __ZN4ggml3cpu17extra_buffer_typeD2Ev',
  '000000000000000c (__TEXT,__text) private external __ZN4ggml3cpu17extra_buffer_typeD2Ev',
  'ggml::cpu::extra_buffer_type::~extra_buffer_type()',
  ['traits.o', 'traits.o'],
);
const DL_HANDLE_DTOR = symbol(
  '00000000000001c0 (__TEXT,__text) weak private external __ZNSt3__110unique_ptrIv17dl_handle_deleterED1B9nqe210106Ev',
  '00000000000001c0 (__TEXT,__text) weak private external __ZNSt3__110unique_ptrIv17dl_handle_deleterED1B9nqe210106Ev',
  'std::__1::unique_ptr<void, dl_handle_deleter>::~unique_ptr[abi:nqe210106]()',
  ['ggml-backend-reg.o', 'ggml-backend-reg.o'],
);
const REPACK_VTABLE = symbol(
  '0000000000029778 (__DATA,__const) weak external automatically hidden __ZTVN4ggml3cpu6repack17extra_buffer_typeE',
  '0000000000025808 (__DATA,__const) weak private external __ZTVN4ggml3cpu6repack17extra_buffer_typeE',
  'vtable for ggml::cpu::repack::extra_buffer_type',
  [
    'repack-e3da9b24e36425e980c1cd620fcf0394.o',
    'repack-7af0d67d55faee835825e4bd9c82d88e.o',
  ],
);
const TENSOR_TRAITS_VTABLE = symbol(
  '0000000000000158 (__DATA,__const) external __ZTVN4ggml3cpu13tensor_traitsE',
  '0000000000000158 (__DATA,__const) private external __ZTVN4ggml3cpu13tensor_traitsE',
  'vtable for ggml::cpu::tensor_traits',
  ['traits.o', 'traits.o'],
);
const UNRENAMED_BUILD = [
  symbol(
    '00000000000000b0 (__TEXT,__text) external __Z8dl_errorv',
    '00000000000000b0 (__TEXT,__text) private external __Z8dl_errorv',
    'dl_error()',
    ['ggml-backend-dl.o', 'ggml-backend-dl.o'],
  ),
  symbol(
    '00000000000000ac (__TEXT,__text) external __Z10dl_get_symPvPKc',
    '00000000000000ac (__TEXT,__text) private external __Z10dl_get_symPvPKc',
    'dl_get_sym(void*, char const*)',
    ['ggml-backend-dl.o', 'ggml-backend-dl.o'],
  ),
  DL_LOAD,
  EXTRA_BUFFER_TYPE_COLD_DTOR,
  symbol(
    '0000000000000010 (__TEXT,__text) external [cold func] __ZN4ggml3cpu17extra_buffer_typeD1Ev',
    '0000000000000010 (__TEXT,__text) private external [cold func] __ZN4ggml3cpu17extra_buffer_typeD1Ev',
    'ggml::cpu::extra_buffer_type::~extra_buffer_type()',
    ['traits.o', 'traits.o'],
  ),
  EXTRA_BUFFER_TYPE_DTOR,
  symbol(
    '0000000000027f18 (__TEXT,__text) weak private external __ZN4ggml3cpu6repack17extra_buffer_typeD0Ev',
    '000000000002418c (__TEXT,__text) weak private external __ZN4ggml3cpu6repack17extra_buffer_typeD0Ev',
    'ggml::cpu::repack::extra_buffer_type::~extra_buffer_type()',
    [
      'repack-e3da9b24e36425e980c1cd620fcf0394.o',
      'repack-7af0d67d55faee835825e4bd9c82d88e.o',
    ],
  ),
  symbol(
    '0000000000027f14 (__TEXT,__text) weak private external __ZN4ggml3cpu6repack17extra_buffer_typeD1Ev',
    '0000000000024188 (__TEXT,__text) weak private external __ZN4ggml3cpu6repack17extra_buffer_typeD1Ev',
    'ggml::cpu::repack::extra_buffer_type::~extra_buffer_type()',
    [
      'repack-e3da9b24e36425e980c1cd620fcf0394.o',
      'repack-7af0d67d55faee835825e4bd9c82d88e.o',
    ],
  ),
  symbol(
    '0000000000000008 (__TEXT,__text) external [cold func] __ZN4ggml3cpu13tensor_traitsD0Ev',
    '0000000000000008 (__TEXT,__text) private external [cold func] __ZN4ggml3cpu13tensor_traitsD0Ev',
    'ggml::cpu::tensor_traits::~tensor_traits()',
    ['traits.o', 'traits.o'],
  ),
  symbol(
    '0000000000000004 (__TEXT,__text) external [cold func] __ZN4ggml3cpu13tensor_traitsD1Ev',
    '0000000000000004 (__TEXT,__text) private external [cold func] __ZN4ggml3cpu13tensor_traitsD1Ev',
    'ggml::cpu::tensor_traits::~tensor_traits()',
    ['traits.o', 'traits.o'],
  ),
  symbol(
    '0000000000000000 (__TEXT,__text) external __ZN4ggml3cpu13tensor_traitsD2Ev',
    '0000000000000000 (__TEXT,__text) private external __ZN4ggml3cpu13tensor_traitsD2Ev',
    'ggml::cpu::tensor_traits::~tensor_traits()',
    ['traits.o', 'traits.o'],
  ),
  CMP_TOP_K_SORT,
  NODE_INFO_EMPLACE,
  DL_HANDLE_DTOR,
  symbol(
    '00000000000014cc (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEE20__throw_length_errorB9nqe210106Ev',
    '00000000000015e4 (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEE20__throw_length_errorB9nqe210106Ev',
    'std::__1::vector<node_info, std::__1::allocator<node_info>>::__throw_length_error[abi:nqe210106]()',
    ['ggml-metal-common.o', 'ggml-metal-common.o'],
  ),
  symbol(
    '00000000000013ac (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEED1B9nqe210106Ev',
    '00000000000014c4 (__TEXT,__text) weak private external __ZNSt3__16vectorI9node_infoNS_9allocatorIS1_EEED1B9nqe210106Ev',
    'std::__1::vector<node_info, std::__1::allocator<node_info>>::~vector[abi:nqe210106]()',
    ['ggml-metal-common.o', 'ggml-metal-common.o'],
  ),
  NODE_INFO_RESERVE,
  symbol(
    '00000000000001c8 (__DATA,__const) external __ZTIN4ggml3cpu17extra_buffer_typeE',
    '00000000000001c8 (__DATA,__const) private external __ZTIN4ggml3cpu17extra_buffer_typeE',
    'typeinfo for ggml::cpu::extra_buffer_type',
    ['traits.o', 'traits.o'],
  ),
  symbol(
    '00000000000297a8 (__DATA,__const) weak private external __ZTIN4ggml3cpu6repack17extra_buffer_typeE',
    '0000000000025838 (__DATA,__const) weak private external __ZTIN4ggml3cpu6repack17extra_buffer_typeE',
    'typeinfo for ggml::cpu::repack::extra_buffer_type',
    [
      'repack-e3da9b24e36425e980c1cd620fcf0394.o',
      'repack-7af0d67d55faee835825e4bd9c82d88e.o',
    ],
  ),
  symbol(
    '00000000000295c8 (__DATA,__const) weak private external __ZTIN4ggml3cpu6repack18tensor_traits_baseE',
    '0000000000025688 (__DATA,__const) weak private external __ZTIN4ggml3cpu6repack18tensor_traits_baseE',
    'typeinfo for ggml::cpu::repack::tensor_traits_base',
    [
      'repack-e3da9b24e36425e980c1cd620fcf0394.o',
      'repack-7af0d67d55faee835825e4bd9c82d88e.o',
    ],
  ),
  symbol(
    '0000000000000188 (__DATA,__const) external __ZTIN4ggml3cpu13tensor_traitsE',
    '0000000000000188 (__DATA,__const) private external __ZTIN4ggml3cpu13tensor_traitsE',
    'typeinfo for ggml::cpu::tensor_traits',
    ['traits.o', 'traits.o'],
  ),
  symbol(
    '00000000000001f3 (__TEXT,__const) external __ZTSN4ggml3cpu17extra_buffer_typeE',
    '00000000000001f3 (__TEXT,__const) private external __ZTSN4ggml3cpu17extra_buffer_typeE',
    'typeinfo name for ggml::cpu::extra_buffer_type',
    ['traits.o', 'traits.o'],
  ),
  symbol(
    '0000000000028b5e (__TEXT,__const) weak private external __ZTSN4ggml3cpu6repack17extra_buffer_typeE',
    '0000000000024ce4 (__TEXT,__const) weak private external __ZTSN4ggml3cpu6repack17extra_buffer_typeE',
    'typeinfo name for ggml::cpu::repack::extra_buffer_type',
    [
      'repack-e3da9b24e36425e980c1cd620fcf0394.o',
      'repack-7af0d67d55faee835825e4bd9c82d88e.o',
    ],
  ),
  symbol(
    '0000000000028695 (__TEXT,__const) weak private external __ZTSN4ggml3cpu6repack18tensor_traits_baseE',
    '000000000002485a (__TEXT,__const) weak private external __ZTSN4ggml3cpu6repack18tensor_traits_baseE',
    'typeinfo name for ggml::cpu::repack::tensor_traits_base',
    [
      'repack-e3da9b24e36425e980c1cd620fcf0394.o',
      'repack-7af0d67d55faee835825e4bd9c82d88e.o',
    ],
  ),
  symbol(
    '00000000000001d8 (__TEXT,__const) external __ZTSN4ggml3cpu13tensor_traitsE',
    '00000000000001d8 (__TEXT,__const) private external __ZTSN4ggml3cpu13tensor_traitsE',
    'typeinfo name for ggml::cpu::tensor_traits',
    ['traits.o', 'traits.o'],
  ),
  symbol(
    '0000000000000198 (__DATA,__const) external __ZTVN4ggml3cpu17extra_buffer_typeE',
    '0000000000000198 (__DATA,__const) private external __ZTVN4ggml3cpu17extra_buffer_typeE',
    'vtable for ggml::cpu::extra_buffer_type',
    ['traits.o', 'traits.o'],
  ),
  REPACK_VTABLE,
  TENSOR_TRAITS_VTABLE,
];

const STD_OVER_GGML = sym(
  '00000000000001c0',
  'weak private external',
  '__ZNSt3__16vectorIP11ggml_tensorNS_9allocatorIS2_EEED2Ev',
  'std::__1::vector<ggml_tensor*, std::__1::allocator<ggml_tensor*> >::~vector()',
);
const C_FUNCTION = sym(
  '0000000000000220',
  'private external',
  '_some_helper',
  'some_helper',
);
const OTHER_NAMESPACE = sym(
  '0000000000000280',
  'external',
  '__ZN6pocket6helperEv',
  'pocket::helper()',
);
const OTHER_FACEBOOK_NAMESPACE = sym(
  '00000000000002c0',
  'weak private external',
  '__ZN8facebook4yoga4NodeD2Ev',
  'facebook::yoga::Node::~Node()',
);
const WHISPER_PROTOCOL = sym(
  '0000000000000300',
  'weak private external [no dead strip]',
  '__OBJC_PROTOCOL_$_RNWhisperDelegate',
  '_OBJC_PROTOCOL_$_RNWhisperDelegate',
  '(__DATA,__data)',
);
const OWN_A = sym(
  '0000000000000240',
  'external',
  '_rnllama_only',
  'rnllama_only',
);
const OWN_B = sym(
  '0000000000000240',
  'external',
  '_rnwhisper_only',
  'rnwhisper_only',
);

const archive = (name, members) =>
  members
    .map(([member, lines]) => `\n${name}(${member}):\n${lines.join('\n')}\n`)
    .join('');

const mangled = fixture => fixture.a.split(' ').pop().slice(1);

const CANARY = {
  a: '__ZNSt3__16vectorIiNS_9allocatorIiEEED2Ev',
  demangled: 'std::__1::vector<int, std::__1::allocator<int>>::~vector()',
};

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-ios-symbol-overlap-'));
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'nm'),
    `#!/bin/bash
[ "$1 $2" = "-m -U" ] || { echo "stub nm: unexpected flags $*" >&2; exit 2; }
[ -n "\${STUB_NM_FAIL:-}" ] && exit 1
cat "$3.nm"
`,
    {mode: 0o755},
  );
  fs.writeFileSync(
    path.join(bin, 'c++filt'),
    `#!/bin/bash
[ "$*" = -n ] || { echo "stub c++filt: expected only -n, got $*" >&2; exit 2; }
awk -F '\\t' 'FILENAME == ARGV[1] { map[$1] = $2; next } { print ($0 in map) ? map[$0] : $0 }' "$STUB_CXXFILT_MAP" -
`,
    {mode: 0o755},
  );
  fs.writeFileSync(
    path.join(bin, 'xcrun'),
    `#!/bin/bash
[ -n "\${STUB_XCRUN_FAIL:-}" ] && exit 1
tool=$1
shift
case $tool in
  clang)
    awk -v local="\${STUB_PLANT_LOCAL:-}" '
      /^\\.globl / { global = 1 }
      /^\\.private_extern / { private = 1 }
      /^\\.weak_definition / { weak = 1 }
      /^\\.weak_def_can_be_hidden / { hidden = 1 }
      /:$/ { name = substr($0, 1, length($0) - 1) }
      END {
        binding = global && !local ? "external" : "non-external"
        if (binding == "external" && private) binding = "private " binding
        if (binding != "non-external" && weak) binding = "weak " binding
        if (hidden) binding = binding " automatically hidden"
        print "0000000000000000 (__TEXT,__text) " binding " " name
      }' >"\${@: -1}"
    ;;
  libtool)
    [ "$1 $2" = "-static -o" ] || exit 2
    { printf '\\n%s(%s):\\n' "$3" "$(basename "$4")"; cat "$4"; } >"$3.nm"
    : >"$3"
    ;;
  *) exit 2 ;;
esac
`,
    {mode: 0o755},
  );
  fs.writeFileSync(
    path.join(tmp, 'cxxfilt.map'),
    [...fixtures, CANARY].map(f => `${mangled(f)}\t${f.demangled}\n`).join(''),
  );
});

afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

function run(aSymbols, bSymbols, {env = {}, args, selfTest = false} = {}) {
  const a = path.join(tmp, 'libllama-rn.a');
  const b = path.join(tmp, 'libwhisper-rn.a');
  fs.writeFileSync(
    `${a}.nm`,
    archive(
      a,
      aSymbols.map(s => [s.members[0], [s.a]]),
    ),
  );
  fs.writeFileSync(
    `${b}.nm`,
    archive(
      b,
      bSymbols.map(s => [s.members[1], [s.b]]),
    ),
  );
  const result = spawnSync(
    'bash',
    [SCRIPT, ...(args || [...(selfTest ? ['--self-test'] : []), a, b])],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}`,
        STUB_CXXFILT_MAP: path.join(tmp, 'cxxfilt.map'),
        ...env,
      },
    },
  );
  const verdicts = result.stdout
    .split('\n')
    .filter(line => /^(ALLOW|DENY) /.test(line));
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    verdicts,
  };
}

const verdictOf = (result, fixture) =>
  result.verdicts
    .filter(line => line.endsWith(` ${fixture.demangled}`))
    .map(line => line.split(' ')[0]);

const ALLOWED = {
  'a std:: function': STD_FUNCTION,
  'a JSI constructor': JSI,
  'a std:: template over a React type': REACT_IN_STD,
  'the terminate helper': TERMINATE,
  'a std:: destructor': STD_DESTRUCTOR,
  'a std:: vtable': STD_VTABLE,
  'std:: typeinfo': STD_TYPEINFO,
  'a std:: typeinfo name': STD_TYPEINFO_NAME,
  'a std:: template over a system typedef': STD_OVER_SYSTEM_TYPEDEF,
  'a std:: template returning void': RETURNS_VOID,
  'a std:: template returning unsigned int': RETURNS_UNSIGNED_INT,
  'a std:: template returning char const*': RETURNS_CHAR_POINTER,
  'a std:: template returning bool': RETURNS_BOOL,
  'a std:: template returning long, with numeric arguments':
    RETURNS_LONG_WITH_LITERALS,
  'a std:: template over an enum value': ENUM_TEMPLATE_ARGUMENT,
  'a JSI template returning void': JSI_RETURNS_VOID,
  'a std:: virtual thunk': VIRTUAL_THUNK,
  'a std:: construction vtable': CONSTRUCTION_VTABLE,
  'a std:: VTT': VTT,
  'a block descriptor': BLOCK_DESCRIPTOR,
  'a block copy helper': COPY_HELPER,
  'a block destroy helper': DESTROY_HELPER,
  'an ObjC protocol record': OBJC_PROTOCOL,
  'an ObjC protocol label': OBJC_LABEL_PROTOCOL,
};

const DENIED = {
  'a std:: template over a first-party type': NODE_INFO_RESERVE,
  'a std:: template returning a first-party type': NODE_INFO_EMPLACE,
  'a std:: template over a first-party comparator': CMP_TOP_K_SORT,
  'a global C function': C_FUNCTION,
  'a first-party namespace': OTHER_NAMESPACE,
  'a first-party class': THREAD_POOL,
  'a ggml::cpu vtable': TENSOR_TRAITS_VTABLE,
  'a weak ggml::cpu vtable': REPACK_VTABLE,
  'a ggml::cpu destructor': EXTRA_BUFFER_TYPE_COLD_DTOR,
  'a dl_ function': DL_LOAD,
  'a std:: template over a ggml type': STD_OVER_GGML,
  'a std:: template over a dl_ type': DL_HANDLE_DTOR,
  'a facebook:: namespace other than JSI and React': OTHER_FACEBOOK_NAMESPACE,
  'an ObjC protocol named after whisper': WHISPER_PROTOCOL,
};

describe('allowed overlap', () => {
  it.each(Object.entries(ALLOWED))('passes %s', (_, fixture) => {
    const result = run([fixture, OWN_A], [fixture, OWN_B]);
    expect(verdictOf(result, fixture)).toEqual(['ALLOW']);
    expect(result.stdout).toContain(`  ${fixture.a}\n  ${fixture.b}\n`);
    expect(result.stdout).toContain('1 shared, 0 denied');
    expect(result.status).toBe(0);
  });

  it('passes all of them together, printing both bindings', () => {
    const allowed = Object.values(ALLOWED);
    const result = run([...allowed, OWN_A], [...allowed, OWN_B]);
    expect(result.verdicts).toHaveLength(allowed.length);
    expect(result.verdicts).toContain(
      `ALLOW weak external automatically hidden / weak private external ${STD_OVER_SYSTEM_TYPEDEF.demangled}`,
    );
    expect(result.stdout).toContain(`${allowed.length} shared, 0 denied`);
    expect(result.status).toBe(0);
  });

  it('passes archives that share nothing', () => {
    const result = run([OWN_A], [OWN_B]);
    expect(result.verdicts).toEqual([]);
    expect(result.stdout).toContain('0 shared, 0 denied');
    expect(result.status).toBe(0);
  });
});

describe('denied overlap', () => {
  it.each(Object.entries(DENIED))('fails on %s', (_, fixture) => {
    const result = run(
      [STD_FUNCTION, fixture, OWN_A],
      [STD_FUNCTION, fixture, OWN_B],
    );
    expect(verdictOf(result, fixture)).toEqual(['DENY']);
    expect(result.stdout).toContain(`  ${fixture.a}\n  ${fixture.b}\n`);
    expect(result.stdout).toContain('2 shared, 1 denied');
    expect(result.status).toBe(1);
  });

  it('fails whatever binding each side has', () => {
    const shared = [TENSOR_TRAITS_VTABLE, REPACK_VTABLE];
    const result = run(shared, shared);
    expect(result.verdicts).toEqual([
      'DENY external / private external vtable for ggml::cpu::tensor_traits',
      'DENY weak external automatically hidden / weak private external vtable for ggml::cpu::repack::extra_buffer_type',
    ]);
    expect(result.status).toBe(1);
  });

  it('fails on every duplicate of a build that ld links by keeping one copy', () => {
    const result = run(UNRENAMED_BUILD, UNRENAMED_BUILD);
    expect(result.verdicts).toHaveLength(28);
    for (const fixture of UNRENAMED_BUILD) {
      expect(verdictOf(result, fixture)).toEqual(
        UNRENAMED_BUILD.filter(f => f.demangled === fixture.demangled).map(
          () => 'DENY',
        ),
      );
      expect(result.stdout).toContain(`  ${fixture.a}\n  ${fixture.b}\n`);
    }
    expect(result.stdout).toContain('28 shared, 28 denied');
    expect(result.status).toBe(1);
  });
});

describe('the binding filter', () => {
  it('ignores names that are non-external on either side', () => {
    const local = both(
      nmLine('0000000000000300', 'non-external', '__ZN4ggml3cpu5localEv'),
    );
    const wasHidden = both(
      nmLine(
        '0000000000000340',
        'non-external (was a private external)',
        '__ZN4ggml3cpu17extra_buffer_typeD2Ev',
      ),
    );
    const result = run(
      [local, wasHidden, OWN_A],
      [local, EXTRA_BUFFER_TYPE_DTOR, OWN_B],
    );
    expect(result.verdicts).toEqual([]);
    expect(result.status).toBe(0);
  });

  it('keeps a binding it does not know, so a new kind of collision fails', () => {
    const autoHidden = both(
      nmLine(
        '0000000000000100',
        'weak external automatically hidden',
        '__ZTVN4ggml3cpu17extra_buffer_typeE',
        '(__DATA,__const)',
      ),
    );
    const unknown = both(
      nmLine('0000000000000380', 'brand-new kind', '_ggml_future'),
    );
    const result = run([autoHidden, unknown], [autoHidden, unknown]);
    expect(result.verdicts).toEqual([
      'DENY weak external automatically hidden / weak external automatically hidden vtable for ggml::cpu::extra_buffer_type',
      'DENY brand-new kind / brand-new kind ggml_future',
    ]);
    expect(result.status).toBe(1);
  });

  it('drops bracketed annotations around the binding', () => {
    const annotated = both(
      nmLine(
        '0000000000000180',
        '[referenced dynamically] external [no dead strip]',
        '__Z15dl_load_libraryRKNSt3__14__fs10filesystem4pathE',
      ),
    );
    const result = run(
      [annotated, EXTRA_BUFFER_TYPE_COLD_DTOR],
      [DL_LOAD, EXTRA_BUFFER_TYPE_COLD_DTOR],
    );
    expect(result.verdicts).toEqual([
      'DENY external / private external dl_load_library(std::__1::__fs::filesystem::path const&)',
      'DENY external / private external ggml::cpu::extra_buffer_type::~extra_buffer_type()',
    ]);
    expect(result.status).toBe(1);
  });

  it('keeps a common symbol', () => {
    const common = both(
      nmLine(
        '0000000000000008',
        '(alignment 2^3) external',
        '_ggml_common',
        '(common)',
      ),
    );
    const result = run([common], [common]);
    expect(result.verdicts).toEqual([
      'DENY (alignment 2^3) external / (alignment 2^3) external ggml_common',
    ]);
    expect(result.status).toBe(1);
  });
});

describe('demangling', () => {
  it('strips exactly one underscore before demangling', () => {
    const result = run([STD_FUNCTION], [STD_FUNCTION]);
    expect(result.verdicts).toEqual([
      'ALLOW weak private external / weak private external std::__throw_bad_array_new_length[abi:nqe210106]()',
    ]);
  });

  it('denies a std:: name that stayed mangled, rather than allowing it', () => {
    fs.writeFileSync(path.join(tmp, 'cxxfilt.map'), '');
    const result = run([STD_FUNCTION], [STD_FUNCTION]);
    expect(result.verdicts).toEqual([
      'DENY weak private external / weak private external _ZSt28__throw_bad_array_new_lengthB9nqe210106v',
    ]);
    expect(result.status).toBe(1);
  });
});

describe('self-test', () => {
  const PLANTED = [
    'DENY external / external ggml_planted_strong',
    'DENY weak external / weak external ggml_planted_weak',
    'DENY weak private external / weak private external ggml_planted_weak_hidden',
    'DENY weak external automatically hidden / weak external automatically hidden ggml_planted_autohidden',
  ];

  it('denies a planted symbol of each binding, then compares the archives', () => {
    const result = run([STD_FUNCTION, OWN_A], [STD_FUNCTION, OWN_B], {
      selfTest: true,
    });
    expect(result.verdicts.slice(0, PLANTED.length)).toEqual(PLANTED);
    expect(verdictOf(result, STD_FUNCTION)).toEqual(['ALLOW']);
    expect(result.stdout.trim().split('\n').pop()).toBe('1 shared, 0 denied');
    expect(result.status).toBe(0);
  });

  it('still fails a denied overlap after it passes', () => {
    const result = run([C_FUNCTION, OWN_A], [C_FUNCTION, OWN_B], {
      selfTest: true,
    });
    expect(verdictOf(result, C_FUNCTION)).toEqual(['DENY']);
    expect(result.status).toBe(1);
  });

  it.each([
    [
      'c++filt -n leaves a std:: name mangled',
      {STUB_CXXFILT_MAP: '/dev/null'},
      'c++filt -n left a std:: name mangled',
    ],
    [
      'a planted symbol is not denied',
      {STUB_PLANT_LOCAL: '1'},
      'a planted ggml_planted_strong was not denied',
    ],
    [
      'the toolchain cannot build a planted symbol',
      {STUB_XCRUN_FAIL: '1'},
      'could not build a planted ggml_planted_strong',
    ],
  ])('fails before comparing when %s', (_, env, message) => {
    const result = run([STD_FUNCTION, OWN_A], [STD_FUNCTION, OWN_B], {
      selfTest: true,
      env,
    });
    expect(result.stderr).toContain(message);
    expect(result.stdout).not.toContain('1 shared, 0 denied');
    expect(result.status).toBe(1);
  });
});

describe('failures', () => {
  it('fails when an archive has no external symbols', () => {
    const result = run([STD_FUNCTION], []);
    expect(result.stderr).toContain('no external symbols in');
    expect(result.status).toBe(1);
  });

  it('fails when an archive has only non-external symbols', () => {
    const local = both(nmLine('0000000000000300', 'non-external', '_local'));
    const result = run([local], [STD_FUNCTION]);
    expect(result.stderr).toContain('no external symbols in');
    expect(result.status).toBe(1);
  });

  it('fails when nm cannot read an archive', () => {
    const result = run([STD_FUNCTION], [STD_FUNCTION], {
      env: {STUB_NM_FAIL: '1'},
    });
    expect(result.stderr).toContain('nm could not read');
    expect(result.status).toBe(1);
  });

  it.each([
    [[]],
    [['a.a']],
    [['a.a', 'b.a', 'c.a']],
    [['--self-test', 'a.a']],
    [['a.a', '--self-test', 'b.a']],
  ])('prints usage and exits 64 for %j', args => {
    const result = run([STD_FUNCTION], [STD_FUNCTION], {args});
    expect(result.stderr).toMatch(/^usage: /);
    expect(result.status).toBe(64);
  });
});
