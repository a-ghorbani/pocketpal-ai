// rnllama.metallib targets iOS 18 and carries bf16 kernels, which GPUs below Apple6 lack.
func disablesLlamaMetal(iOS18OrLater: Bool, supportsApple6: Bool) -> Bool {
  !iOS18OrLater || !supportsApple6
}
