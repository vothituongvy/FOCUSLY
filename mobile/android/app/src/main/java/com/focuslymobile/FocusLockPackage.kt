package com.focuslymobile

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class FocusLockPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      when (name) {
        FocusLockModule.NAME -> FocusLockModule(reactContext)
        FilePickerModule.NAME -> FilePickerModule(reactContext) // chọn file để tạo câu hỏi / flashcard
        SpeechModule.NAME -> SpeechModule(reactContext) // đọc thành tiếng + luyện phát âm
        WidgetModule.NAME -> WidgetModule(reactContext) // widget màn hình chính
        else -> null
      }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        FocusLockModule.NAME to
            ReactModuleInfo(FocusLockModule.NAME, FocusLockModule::class.java.name, false, false, false, false),
        FilePickerModule.NAME to
            ReactModuleInfo(FilePickerModule.NAME, FilePickerModule::class.java.name, false, false, false, false),
        SpeechModule.NAME to
            ReactModuleInfo(SpeechModule.NAME, SpeechModule::class.java.name, false, false, false, false),
        WidgetModule.NAME to
            ReactModuleInfo(WidgetModule.NAME, WidgetModule::class.java.name, false, false, false, false),
    )
  }
}
