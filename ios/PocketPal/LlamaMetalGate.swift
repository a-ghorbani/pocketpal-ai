// rnllama.metallib and rnwhisper.metallib target iOS 18 and carry bf16 kernels, which GPUs below Apple6 lack.
func disablesGgmlMetal(iOS18OrLater: Bool, supportsApple6: Bool) -> Bool {
  !iOS18OrLater || !supportsApple6
}
