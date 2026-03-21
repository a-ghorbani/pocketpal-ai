# Fork update

Since the majority of the users of this application are those who wish to gain a deeper understanding of large models, I place greater emphasis on learning and exploration. I try to provide more parameters for users to debug, with easy recovery from incorrect adjustments, while exposing as much of the pipeline as possible so users can clearly see the model’s inputs, outputs, and adjustment methods. Because the chain is fully controllable, when the model encounters issues, configurations can be adjusted directly instead of waiting for code-level changes, making experimentation more flexible.


1. Added the ability to directly import local VLM models, supporting both model imports and visual component imports for MM Projects.

2. Fully exposed and made customizable the prompt template logic.

3. Added functionality to share GGUF model files.

4. Implemented logging features.

5. Exposed other interfaces that were previously available but not displayed in the UI.

6. Optimized the template matching mechanism in version 132; besides the 10 recommended built-in models, it now prioritizes reading the model's own configuration to avoid mis-matching different model series. (Note: qwen3.5 models directly compiled from version 132 will output garbled text.)

7. Critical modification! If the number of GPU unloading layers is too high, it can cause the model output to be garbled. However, in version 132, the default number of unloading layers is set to 99 (fully loaded), and I changed it to 0.

8. Add a template selector switch, allowing the selection of the chat-formatter / Nunjucks interpreter or the llama.cpp Jinja chat template interpreter.

9. Add a progress bar featuring location markers for each conversation, along with up/down navigation toggles to quickly jump between different conversations.

10. Real-time memory usage display has also been enabled on Android.

11. Added compilation for **Apple IPA installers**.

* Split the single "Think" button into **three buttons**:
* Whether to enable the UI-layer thinking box.
* Whether to activate thinking at the parameter level.
* Whether to incorporate thinking into the context.

12. Added an independent control for the visual encoder to freely choose between CPU or GPU loading, with CPU now set as the default. This improves compatibility compared to the original forced GPU mode, which caused various issues including crashes and image recognition errors.

13. Add the formula rendering feature.
    It is recommended to use this alongside system prompts to standardize the model's output.
    
    ```
    数学公式用LaTeX格式输出：行内用$...$，独立用$$...$$。
    Output math formulas in LaTeX: inline $...$ and display $$...$$.
    Never use code blocks for math.
    ```
<p align="center">
  <img src="https://github.com/user-attachments/assets/4be53075-4dcb-424d-bedd-265ffd10715c" width="24%" />
  <img src="https://github.com/user-attachments/assets/a1be9b04-b10d-4ade-a011-406effa547d9" width="24%" />
  <img src="https://github.com/user-attachments/assets/9a808f3c-256e-419d-a455-2f337c04eb17" width="24%" />
  <img src="https://github.com/user-attachments/assets/bb4a9ca2-ed13-4592-ae71-261d9aa4bad2" width="24%" />
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/9d62acaf-ef05-49b0-a9f2-99292fd4ae59" width="24%" />
  <img src="https://github.com/user-attachments/assets/24e3edc5-c92c-43e6-9710-a301364f34c4" width="24%" />
  <img src="https://github.com/user-attachments/assets/d72b6e40-ec67-4325-8aaa-85903623c401" width="24%" />
  <img src="https://github.com/user-attachments/assets/d04d0e6b-29ad-4d6a-b625-24d9b7a75129" width="24%" />
</p>

## New Architecture Goals --- Normalized inference flow

| # | Architecture Type | Message Type | Logic | Status |
| :--- | :--- | :--- | :--- | :--- |
| ① | Jinja Built-in | Plain Text | A { messages, jinja: true } | ✓ Model Built-in |
| ② | Jinja Built-in | Multimodal | A { messages, jinja: true } | ✓ Model Built-in |
| ③ | Custom Jinja | Plain Text | A { messages, chatTemplate, jinja: true } | ✓ User Customized |
| ④ | Custom Jinja | Multimodal | A { messages, chatTemplate, jinja: true } | ✓ User Customized |
| ⑤ | Nunjucks | Plain Text | B { prompt, jinja: false } | ✓ JS Rendering |
| ⑥ | Nunjucks | Multimodal | A { messages, jinja: true } | ✗ Falls back to Built-in Template (+ UI Hint) |

### Pipeline Optimization
Only two JS remain on the entire pipeline.

| JS | Applicable Scenario | Can it be avoided? |
| :--- | :--- | :--- |
| **token callback** | All 6 scenarios | **No**, as it is the sole streaming mechanism for llama.rn. |
| **applyChatTemplate()** | Only scenario ⑤ | **Yes**. If users use Jinja exclusively, this JS will not be triggered at all. |

> [!IMPORTANT]
> Just need to synchronize adaptations whenever **llama.rn** is updated.

---

### Version Notes & Compatibility
the new llama version 0.11.3 (app-1.12.2 This repository is also developed based on this version) can control Qwen 3.5's thinking capabilities. In the default template, versions of 9B and above possess both enable/disable functions for thinking, whereas versions below 9B do not have this feature by default. Simply copy the 9B template and apply it to the 4B, 2B, and 0.8B models; you will then be able to control thinking with the new version!!!

Please note that when you turn off the "resemble format" (RF button), your thinking chain will merge into the main text and thus won't appear in the thinking box. 

in the older llama version 0.11.0 （app-1.11.21）can you control their thinking without configuring templates for the 4B, 2B, and 0.8B models. This repository also includes a branch specifically designed to be compatible with llama version 0.11.0; please note that under the Android framework, engine switching is not possible—you can only have one engine per app.

### CI/CD & Downloads
I have optimized the compilation for versions **1.11.21** and **1.12.2**, enabling direct generation of **APK** and **IPA** installer packages via actions; feel free to compile and test them yourself.

* [https://github.com/CCSSNE/bianyi-1.11.21](https://github.com/CCSSNE/bianyi-1.11.21)
* [https://github.com/CCSSNE/bianyi-1.12.2](https://github.com/CCSSNE/bianyi-1.12.2)

## 联系方式
** 招募对手机推理大模型感兴趣的朋友。我们来共同改进这个应用。QQ2831835831

下一步主要是增加更多的多模态输入输出，例如语音，生图，文件输入和MCP工具。多模态这方面，向mmn软件看齐

或者是增加调用API的功能，或者是当API服务器(可以方便的在线本地模型对比，以后或许可以多模型聚合讨论)。**

