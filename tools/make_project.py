#!/usr/bin/env python3
"""Generates P2000Apeldoorn.xcodeproj (Xcode 16+ synchronized folders)."""
import hashlib, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def oid(name):
    return hashlib.md5(name.encode()).hexdigest()[:24].upper()

APP_BUNDLE = "nl.lrvdlinden.p2000apeldoorn"
I = {k: oid(k) for k in [
    "project", "main", "products", "config", "grpApp", "grpShared", "grpWatch",
    "appProduct", "watchProduct", "baseXC",
    "appTarget", "watchTarget",
    "appSources", "appResources", "appFrameworks", "appEmbedWatch",
    "watchSources", "watchResources", "watchFrameworks",
    "projDebug", "projRelease", "projList", "appDebug", "appRelease", "appList", "watchDebug", "watchRelease", "watchList",
    "pkgOneSignal", "prodOneSignal", "bfOneSignal", "bfEmbedWatch", "depWatch", "proxyWatch",
    "cfgFiles", "grpWidgets", "widgetProduct", "watchWidgetProduct", "widgetTarget", "watchWidgetTarget",
    "widgetSources", "widgetResources", "widgetFrameworks", "wwSources", "wwResources", "wwFrameworks",
    "widgetDebug", "widgetRelease", "widgetList", "wwDebug", "wwRelease", "wwList",
    "tvTarget", "tvProduct", "grpTV", "tvSources", "tvResources", "tvFrameworks", "tvDebug", "tvRelease", "tvList",
    "appEmbedExt", "watchEmbedExt", "bfEmbedWidget", "bfEmbedWatchWidget", "depWidget", "proxyWidget", "depWW", "proxyWW",
    "nsTarget", "nsProduct", "grpNS", "nsSources", "nsResources", "nsFrameworks", "nsDebug", "nsRelease", "nsList",
    "bfEmbedNS", "depNS", "proxyNS"]}

config_files = ["Base.xcconfig", "Secrets.example.xcconfig", "P2000Apeldoorn-Info.plist", "P2000Apeldoorn-iOS.entitlements",
                "P2000Apeldoorn-macOS.entitlements", "P2000ApeldoornWatch-Info.plist", "P2000ApeldoornWatch.entitlements",
                "Widgets-Info.plist", "Widgets-iOS.entitlements", "Widgets-macOS.entitlements",
                "WatchWidgets-Info.plist", "WatchWidgets.entitlements", "P2000ApeldoornTV-Info.plist", "P2000ApeldoornTV.entitlements",
                "Notifications-Info.plist"]
cfg_refs = {f: oid("cfg-" + f) for f in config_files}
I["baseXC"] = cfg_refs["Base.xcconfig"]

def ftype(f):
    return {"xcconfig": "text.xcconfig", "plist": "text.plist.xml", "entitlements": "text.plist.entitlements"}[f.rsplit(".", 1)[1]]

def settings(d, indent="\t\t\t\t"):
    out = []
    for k, v in d.items():
        if "[" in k: k = '"' + k + '"'
        if isinstance(v, list):
            out.append(f"{indent}{k} = (\n" + "".join(f'{indent}\t"{x}",\n' for x in v) + f"{indent});")
        else:
            sv = str(v)
            if not sv or any(c in sv for c in ' $(),;=-/+:*[]"') and not (sv.startswith('"') and sv.endswith('"')):
                sv = '"' + sv.replace('"', '\\"') + '"'
            out.append(f"{indent}{k} = {sv};")
    return "\n".join(out)

common_proj = {
    "ALWAYS_SEARCH_USER_PATHS": "NO",
    "ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS": "YES",
    "CLANG_ENABLE_MODULES": "YES",
    "CLANG_ENABLE_OBJC_ARC": "YES",
    "ENABLE_STRICT_OBJC_MSGSEND": "YES",
    "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
    "GCC_C_LANGUAGE_STANDARD": "gnu17",
    "LOCALIZATION_PREFERS_STRING_CATALOGS": "YES",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "SWIFT_VERSION": "5.0",
    "IPHONEOS_DEPLOYMENT_TARGET": "18.0",
    "MACOSX_DEPLOYMENT_TARGET": "15.0",
    "WATCHOS_DEPLOYMENT_TARGET": "11.0",
    "TVOS_DEPLOYMENT_TARGET": "18.0",
}
proj_debug = dict(common_proj, **{"DEBUG_INFORMATION_FORMAT": "dwarf", "ENABLE_TESTABILITY": "YES", "GCC_OPTIMIZATION_LEVEL": "0",
    "ONLY_ACTIVE_ARCH": "YES", "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "DEBUG $(inherited)", "SWIFT_OPTIMIZATION_LEVEL": "-Onone",
    "MTL_ENABLE_DEBUG_INFO": "INCLUDE_SOURCE"})
proj_release = dict(common_proj, **{"DEBUG_INFORMATION_FORMAT": "dwarf-with-dsym", "ENABLE_NS_ASSERTIONS": "NO",
    "SWIFT_COMPILATION_MODE": "wholemodule", "VALIDATE_PRODUCT": "YES", "MTL_ENABLE_DEBUG_INFO": "NO"})

app = {
    "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
    "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
    "CODE_SIGN_ENTITLEMENTS[sdk=iphoneos*]": "Config/P2000Apeldoorn-iOS.entitlements",
    "CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]": "Config/P2000Apeldoorn-iOS.entitlements",
    "CODE_SIGN_ENTITLEMENTS[sdk=macosx*]": "Config/P2000Apeldoorn-macOS.entitlements",
    "CODE_SIGN_STYLE": "Automatic",
    "COMBINE_HIDPI_IMAGES": "YES",
    "DEVELOPMENT_TEAM": "EU3UY476T6",
    "ENABLE_HARDENED_RUNTIME": "YES",
    "ENABLE_PREVIEWS": "YES",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_FILE": "Config/P2000Apeldoorn-Info.plist",
    "INFOPLIST_KEY_CFBundleDisplayName": "A-Alerts",
    "INFOPLIST_KEY_LSApplicationCategoryType": "public.app-category.news",
    "INFOPLIST_KEY_NSFaceIDUsageDescription": "Gebruik Face ID om A-Alerts te ontgrendelen.",
    "INFOPLIST_KEY_NSLocationWhenInUseUsageDescription": "Je locatie wordt gebruikt om te tonen hoe ver een melding bij je vandaan is en, als je Mijn buurt aanzet, voor meldingen in jouw buurt. Daarvoor gaat alleen een afgeronde locatie (op ±100 m) naar onze server.",
    "INFOPLIST_KEY_NSHumanReadableCopyright": "© 2026 P2000 Apeldoorn · PixelForges",
    "INFOPLIST_KEY_UIApplicationSceneManifest_Generation[sdk=iphoneos*]": "YES",
    "INFOPLIST_KEY_UIApplicationSceneManifest_Generation[sdk=iphonesimulator*]": "YES",
    "INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents[sdk=iphoneos*]": "YES",
    "INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents[sdk=iphonesimulator*]": "YES",
    "INFOPLIST_KEY_UIStatusBarStyle[sdk=iphoneos*]": "UIStatusBarStyleDefault",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad": "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone": "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight",
    "LD_RUNPATH_SEARCH_PATHS": "$(inherited)",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphoneos*]": "$(inherited) @executable_path/Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphonesimulator*]": "$(inherited) @executable_path/Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=macosx*]": "$(inherited) @executable_path/../Frameworks",
    "PRODUCT_BUNDLE_IDENTIFIER": APP_BUNDLE,
    "PRODUCT_MODULE_NAME": "P2000Apeldoorn",
    "PRODUCT_NAME": "P2000 Apeldoorn",
    "SDKROOT": "auto",
    "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator macosx",
    "SUPPORTS_MACCATALYST": "NO",
    "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD": "NO",
    "SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD": "NO",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "TARGETED_DEVICE_FAMILY": "1,2",
}
watch = {
    "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
    "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
    "CODE_SIGN_ENTITLEMENTS": "Config/P2000ApeldoornWatch.entitlements",
    "CODE_SIGN_STYLE": "Automatic",
    "DEVELOPMENT_TEAM": "EU3UY476T6",
    "ENABLE_PREVIEWS": "YES",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_FILE": "Config/P2000ApeldoornWatch-Info.plist",
    "INFOPLIST_KEY_CFBundleDisplayName": "A-Alerts",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations": "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown",
    "INFOPLIST_KEY_WKCompanionAppBundleIdentifier": APP_BUNDLE,
    "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks",
    "PRODUCT_BUNDLE_IDENTIFIER": APP_BUNDLE + ".watchkitapp",
    "PRODUCT_MODULE_NAME": "P2000ApeldoornWatch",
    "PRODUCT_NAME": "P2000 Apeldoorn Watch",
    "SDKROOT": "watchos",
    "SKIP_INSTALL": "YES",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "TARGETED_DEVICE_FAMILY": "4",
}

widget = {
    "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
    "ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME": "WidgetBackground",
    "APPLICATION_EXTENSION_API_ONLY": "YES",
    "CODE_SIGN_ENTITLEMENTS[sdk=iphoneos*]": "Config/Widgets-iOS.entitlements",
    "CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]": "Config/Widgets-iOS.entitlements",
    "CODE_SIGN_ENTITLEMENTS[sdk=macosx*]": "Config/Widgets-macOS.entitlements",
    "CODE_SIGN_STYLE": "Automatic",
    "DEVELOPMENT_TEAM": "EU3UY476T6",
    "ENABLE_HARDENED_RUNTIME": "YES",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_FILE": "Config/Widgets-Info.plist",
    "INFOPLIST_KEY_CFBundleDisplayName": "A-Alerts",
    "INFOPLIST_KEY_NSHumanReadableCopyright": "© 2026 P2000 Apeldoorn · PixelForges",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphoneos*]": "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphonesimulator*]": "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=macosx*]": "$(inherited) @executable_path/../Frameworks @executable_path/../../../../Frameworks",
    "PRODUCT_BUNDLE_IDENTIFIER": APP_BUNDLE + ".widgets",
    "PRODUCT_MODULE_NAME": "P2000ApeldoornWidgets",
    "PRODUCT_NAME": "P2000 Apeldoorn Widgets",
    "SDKROOT": "auto",
    "SKIP_INSTALL": "YES",
    "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator macosx",
    "SUPPORTS_MACCATALYST": "NO",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "TARGETED_DEVICE_FAMILY": "1,2",
}
watch_widget = {
    "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
    "ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME": "WidgetBackground",
    "APPLICATION_EXTENSION_API_ONLY": "YES",
    "CODE_SIGN_ENTITLEMENTS": "Config/WatchWidgets.entitlements",
    "CODE_SIGN_STYLE": "Automatic",
    "DEVELOPMENT_TEAM": "EU3UY476T6",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_FILE": "Config/WatchWidgets-Info.plist",
    "INFOPLIST_KEY_CFBundleDisplayName": "A-Alerts",
    "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
    "PRODUCT_BUNDLE_IDENTIFIER": APP_BUNDLE + ".watchkitapp.widgets",
    "PRODUCT_MODULE_NAME": "P2000ApeldoornWatchWidgets",
    "PRODUCT_NAME": "P2000 Apeldoorn Watch Widgets",
    "SDKROOT": "watchos",
    "SKIP_INSTALL": "YES",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "TARGETED_DEVICE_FAMILY": "4",
}

tv = {
    "ASSETCATALOG_COMPILER_APPICON_NAME": "App Icon & Top Shelf Image",
    "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
    "CODE_SIGN_ENTITLEMENTS": "Config/P2000ApeldoornTV.entitlements",
    "CODE_SIGN_STYLE": "Automatic",
    "DEVELOPMENT_TEAM": "EU3UY476T6",
    "ENABLE_PREVIEWS": "YES",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_FILE": "Config/P2000ApeldoornTV-Info.plist",
    "INFOPLIST_KEY_CFBundleDisplayName": "A-Alerts",
    "INFOPLIST_KEY_LSApplicationCategoryType": "public.app-category.news",
    "INFOPLIST_KEY_UIUserInterfaceStyle": "Dark",
    "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks",
    # Same bundle ID as the iPhone/iPad/Mac app: one App Store record (universal purchase).
    "PRODUCT_BUNDLE_IDENTIFIER": APP_BUNDLE,
    "PRODUCT_MODULE_NAME": "P2000ApeldoornTV",
    "PRODUCT_NAME": "P2000 Apeldoorn TV",
    "SDKROOT": "appletvos",
    "SUPPORTED_PLATFORMS": "appletvos appletvsimulator",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "TARGETED_DEVICE_FAMILY": "3",
}

# A-Alerts push extension (phase 9): a map of the spot in the notification. iPhone/iPad and Mac, embedded in the app.
notifications = {
    "APPLICATION_EXTENSION_API_ONLY": "YES",
    "CODE_SIGN_STYLE": "Automatic",
    "DEVELOPMENT_TEAM": "EU3UY476T6",
    "ENABLE_HARDENED_RUNTIME": "YES",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_FILE": "Config/Notifications-Info.plist",
    "INFOPLIST_KEY_CFBundleDisplayName": "A-Alerts",
    "INFOPLIST_KEY_NSHumanReadableCopyright": "© 2026 P2000 Apeldoorn · PixelForges",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphoneos*]": "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphonesimulator*]": "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=macosx*]": "$(inherited) @executable_path/../Frameworks @executable_path/../../../../Frameworks",
    "PRODUCT_BUNDLE_IDENTIFIER": APP_BUNDLE + ".notificationservice",
    "PRODUCT_MODULE_NAME": "P2000ApeldoornNotifications",
    "PRODUCT_NAME": "P2000 Apeldoorn Notifications",
    "SDKROOT": "auto",
    "SKIP_INSTALL": "YES",
    "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator macosx",
    "SUPPORTS_MACCATALYST": "NO",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "TARGETED_DEVICE_FAMILY": "1,2",
}

def xcconf(key, name, d, base=None):
    b = f"\t\t\tbaseConfigurationReference = {base} /* Base.xcconfig */;\n" if base else ""
    return f"""\t\t{key} /* {name} */ = {{
\t\t\tisa = XCBuildConfiguration;
{b}\t\t\tbuildSettings = {{
{settings(d)}
\t\t\t}};
\t\t\tname = {name};
\t\t}};
"""

cfg_file_refs = "".join(
    f'\t\t{cfg_refs[f]} /* {f} */ = {{isa = PBXFileReference; lastKnownFileType = {ftype(f)}; path = "{f}"; sourceTree = "<group>"; }};\n'
    for f in config_files)
cfg_children = "".join(f"\t\t\t\t{cfg_refs[f]} /* {f} */,\n" for f in config_files)

pbx = f"""// !$*UTF8*$!
{{
\tarchiveVersion = 1;
\tclasses = {{
\t}};
\tobjectVersion = 77;
\tobjects = {{

/* Begin PBXBuildFile section */
\t\t{I['bfEmbedWidget']} /* P2000 Apeldoorn Widgets.appex in Embed Foundation Extensions */ = {{isa = PBXBuildFile; fileRef = {I['widgetProduct']} /* P2000 Apeldoorn Widgets.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
\t\t{I['bfEmbedWatchWidget']} /* P2000 Apeldoorn Watch Widgets.appex in Embed Foundation Extensions */ = {{isa = PBXBuildFile; fileRef = {I['watchWidgetProduct']} /* P2000 Apeldoorn Watch Widgets.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
\t\t{I['bfEmbedWatch']} /* P2000 Apeldoorn Watch.app in Embed Watch Content */ = {{isa = PBXBuildFile; fileRef = {I['watchProduct']} /* P2000 Apeldoorn Watch.app */; platformFilters = (ios, ); settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
\t\t{I['bfEmbedNS']} /* P2000 Apeldoorn Notifications.appex in Embed Foundation Extensions */ = {{isa = PBXBuildFile; fileRef = {I['nsProduct']} /* P2000 Apeldoorn Notifications.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
/* End PBXBuildFile section */

/* Begin PBXContainerItemProxy section */
\t\t{I['proxyWidget']} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = {I['project']} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {I['widgetTarget']};
\t\t\tremoteInfo = "P2000 Apeldoorn Widgets";
\t\t}};
\t\t{I['proxyWW']} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = {I['project']} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {I['watchWidgetTarget']};
\t\t\tremoteInfo = "P2000 Apeldoorn Watch Widgets";
\t\t}};
\t\t{I['proxyWatch']} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = {I['project']} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {I['watchTarget']};
\t\t\tremoteInfo = "P2000 Apeldoorn Watch";
\t\t}};
\t\t{I['proxyNS']} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = {I['project']} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {I['nsTarget']};
\t\t\tremoteInfo = "P2000 Apeldoorn Notifications";
\t\t}};
/* End PBXContainerItemProxy section */

/* Begin PBXCopyFilesBuildPhase section */
\t\t{I['appEmbedExt']} /* Embed Foundation Extensions */ = {{
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "";
\t\t\tdstSubfolderSpec = 13;
\t\t\tfiles = (
\t\t\t\t{I['bfEmbedWidget']} /* P2000 Apeldoorn Widgets.appex in Embed Foundation Extensions */,
\t\t\t\t{I['bfEmbedNS']} /* P2000 Apeldoorn Notifications.appex in Embed Foundation Extensions */,
\t\t\t);
\t\t\tname = "Embed Foundation Extensions";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['watchEmbedExt']} /* Embed Foundation Extensions */ = {{
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "";
\t\t\tdstSubfolderSpec = 13;
\t\t\tfiles = (
\t\t\t\t{I['bfEmbedWatchWidget']} /* P2000 Apeldoorn Watch Widgets.appex in Embed Foundation Extensions */,
\t\t\t);
\t\t\tname = "Embed Foundation Extensions";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['appEmbedWatch']} /* Embed Watch Content */ = {{
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "$(CONTENTS_FOLDER_PATH)/Watch";
\t\t\tdstSubfolderSpec = 16;
\t\t\tfiles = (
\t\t\t\t{I['bfEmbedWatch']} /* P2000 Apeldoorn Watch.app in Embed Watch Content */,
\t\t\t);
\t\t\tname = "Embed Watch Content";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXCopyFilesBuildPhase section */

/* Begin PBXFileReference section */
\t\t{I['widgetProduct']} /* P2000 Apeldoorn Widgets.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = "P2000 Apeldoorn Widgets.appex"; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{I['watchWidgetProduct']} /* P2000 Apeldoorn Watch Widgets.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = "P2000 Apeldoorn Watch Widgets.appex"; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{I['appProduct']} /* P2000 Apeldoorn.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "P2000 Apeldoorn.app"; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{I['watchProduct']} /* P2000 Apeldoorn Watch.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "P2000 Apeldoorn Watch.app"; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{I['tvProduct']} /* P2000 Apeldoorn TV.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "P2000 Apeldoorn TV.app"; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{I['nsProduct']} /* P2000 Apeldoorn Notifications.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = "P2000 Apeldoorn Notifications.appex"; sourceTree = BUILT_PRODUCTS_DIR; }};
{cfg_file_refs}/* End PBXFileReference section */

/* Begin PBXFileSystemSynchronizedRootGroup section */
\t\t{I['grpWidgets']} /* P2000ApeldoornWidgets */ = {{isa = PBXFileSystemSynchronizedRootGroup; path = P2000ApeldoornWidgets; sourceTree = "<group>"; }};
\t\t{I['grpApp']} /* P2000Apeldoorn */ = {{isa = PBXFileSystemSynchronizedRootGroup; path = P2000Apeldoorn; sourceTree = "<group>"; }};
\t\t{I['grpShared']} /* Shared */ = {{isa = PBXFileSystemSynchronizedRootGroup; path = Shared; sourceTree = "<group>"; }};
\t\t{I['grpWatch']} /* P2000ApeldoornWatch */ = {{isa = PBXFileSystemSynchronizedRootGroup; path = P2000ApeldoornWatch; sourceTree = "<group>"; }};
\t\t{I['grpTV']} /* P2000ApeldoornTV */ = {{isa = PBXFileSystemSynchronizedRootGroup; path = P2000ApeldoornTV; sourceTree = "<group>"; }};
\t\t{I['grpNS']} /* P2000ApeldoornNotifications */ = {{isa = PBXFileSystemSynchronizedRootGroup; path = P2000ApeldoornNotifications; sourceTree = "<group>"; }};
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
\t\t{I['widgetFrameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['wwFrameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['appFrameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['watchFrameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['tvFrameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['nsFrameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t{I['main']} = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{I['grpApp']} /* P2000Apeldoorn */,
\t\t\t\t{I['grpShared']} /* Shared */,
\t\t\t\t{I['grpWatch']} /* P2000ApeldoornWatch */,
\t\t\t\t{I['grpWidgets']} /* P2000ApeldoornWidgets */,
\t\t\t\t{I['grpTV']} /* P2000ApeldoornTV */,
\t\t\t\t{I['grpNS']} /* P2000ApeldoornNotifications */,
\t\t\t\t{I['config']} /* Config */,
\t\t\t\t{I['products']} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{I['config']} /* Config */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
{cfg_children}\t\t\t);
\t\t\tpath = Config;
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{I['products']} /* Products */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{I['appProduct']} /* P2000 Apeldoorn.app */,
\t\t\t\t{I['watchProduct']} /* P2000 Apeldoorn Watch.app */,
\t\t\t\t{I['widgetProduct']} /* P2000 Apeldoorn Widgets.appex */,
\t\t\t\t{I['watchWidgetProduct']} /* P2000 Apeldoorn Watch Widgets.appex */,
\t\t\t\t{I['tvProduct']} /* P2000 Apeldoorn TV.app */,
\t\t\t\t{I['nsProduct']} /* P2000 Apeldoorn Notifications.appex */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t{I['widgetTarget']} /* P2000 Apeldoorn Widgets */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I['widgetList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Widgets" */;
\t\t\tbuildPhases = (
\t\t\t\t{I['widgetSources']} /* Sources */,
\t\t\t\t{I['widgetFrameworks']} /* Frameworks */,
\t\t\t\t{I['widgetResources']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t{I['grpWidgets']} /* P2000ApeldoornWidgets */,
\t\t\t\t{I['grpShared']} /* Shared */,
\t\t\t);
\t\t\tname = "P2000 Apeldoorn Widgets";
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = "P2000 Apeldoorn Widgets";
\t\t\tproductReference = {I['widgetProduct']} /* P2000 Apeldoorn Widgets.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t}};
\t\t{I['watchWidgetTarget']} /* P2000 Apeldoorn Watch Widgets */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I['wwList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Watch Widgets" */;
\t\t\tbuildPhases = (
\t\t\t\t{I['wwSources']} /* Sources */,
\t\t\t\t{I['wwFrameworks']} /* Frameworks */,
\t\t\t\t{I['wwResources']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t{I['grpWidgets']} /* P2000ApeldoornWidgets */,
\t\t\t\t{I['grpShared']} /* Shared */,
\t\t\t);
\t\t\tname = "P2000 Apeldoorn Watch Widgets";
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = "P2000 Apeldoorn Watch Widgets";
\t\t\tproductReference = {I['watchWidgetProduct']} /* P2000 Apeldoorn Watch Widgets.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t}};
\t\t{I['appTarget']} /* P2000 Apeldoorn */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I['appList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn" */;
\t\t\tbuildPhases = (
\t\t\t\t{I['appSources']} /* Sources */,
\t\t\t\t{I['appFrameworks']} /* Frameworks */,
\t\t\t\t{I['appResources']} /* Resources */,
\t\t\t\t{I['appEmbedWatch']} /* Embed Watch Content */,
\t\t\t\t{I['appEmbedExt']} /* Embed Foundation Extensions */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t\t{I['depWatch']} /* PBXTargetDependency */,
\t\t\t\t{I['depWidget']} /* PBXTargetDependency */,
\t\t\t\t{I['depNS']} /* PBXTargetDependency */,
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t{I['grpApp']} /* P2000Apeldoorn */,
\t\t\t\t{I['grpShared']} /* Shared */,
\t\t\t);
\t\t\tname = "P2000 Apeldoorn";
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = "P2000 Apeldoorn";
\t\t\tproductReference = {I['appProduct']} /* P2000 Apeldoorn.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
\t\t{I['watchTarget']} /* P2000 Apeldoorn Watch */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I['watchList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Watch" */;
\t\t\tbuildPhases = (
\t\t\t\t{I['watchSources']} /* Sources */,
\t\t\t\t{I['watchFrameworks']} /* Frameworks */,
\t\t\t\t{I['watchResources']} /* Resources */,
\t\t\t\t{I['watchEmbedExt']} /* Embed Foundation Extensions */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t\t{I['depWW']} /* PBXTargetDependency */,
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t{I['grpWatch']} /* P2000ApeldoornWatch */,
\t\t\t\t{I['grpShared']} /* Shared */,
\t\t\t);
\t\t\tname = "P2000 Apeldoorn Watch";
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = "P2000 Apeldoorn Watch";
\t\t\tproductReference = {I['watchProduct']} /* P2000 Apeldoorn Watch.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
\t\t{I['tvTarget']} /* P2000 Apeldoorn TV */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I['tvList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn TV" */;
\t\t\tbuildPhases = (
\t\t\t\t{I['tvSources']} /* Sources */,
\t\t\t\t{I['tvFrameworks']} /* Frameworks */,
\t\t\t\t{I['tvResources']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t{I['grpTV']} /* P2000ApeldoornTV */,
\t\t\t\t{I['grpShared']} /* Shared */,
\t\t\t);
\t\t\tname = "P2000 Apeldoorn TV";
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = "P2000 Apeldoorn TV";
\t\t\tproductReference = {I['tvProduct']} /* P2000 Apeldoorn TV.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
\t\t{I['nsTarget']} /* P2000 Apeldoorn Notifications */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I['nsList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Notifications" */;
\t\t\tbuildPhases = (
\t\t\t\t{I['nsSources']} /* Sources */,
\t\t\t\t{I['nsFrameworks']} /* Frameworks */,
\t\t\t\t{I['nsResources']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t{I['grpNS']} /* P2000ApeldoornNotifications */,
\t\t\t);
\t\t\tname = "P2000 Apeldoorn Notifications";
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = "P2000 Apeldoorn Notifications";
\t\t\tproductReference = {I['nsProduct']} /* P2000 Apeldoorn Notifications.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t{I['project']} /* Project object */ = {{
\t\t\tisa = PBXProject;
\t\t\tattributes = {{
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 2600;
\t\t\t\tLastUpgradeCheck = 2600;
\t\t\t\tTargetAttributes = {{
\t\t\t\t\t{I['appTarget']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t}};
\t\t\t\t\t{I['watchTarget']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t}};
\t\t\t\t\t{I['widgetTarget']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t}};
\t\t\t\t\t{I['watchWidgetTarget']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t}};
\t\t\t\t\t{I['tvTarget']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t}};
\t\t\t\t\t{I['nsTarget']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t}};
\t\t\t\t}};
\t\t\t}};
\t\t\tbuildConfigurationList = {I['projList']} /* Build configuration list for PBXProject "P2000Apeldoorn" */;
\t\t\tdevelopmentRegion = nl;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\tnl,
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {I['main']};
\t\t\tminimizedProjectReferenceProxies = 1;
\t\t\tpreferredProjectObjectVersion = 77;
\t\t\tproductRefGroup = {I['products']} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t{I['appTarget']} /* P2000 Apeldoorn */,
\t\t\t\t{I['watchTarget']} /* P2000 Apeldoorn Watch */,
\t\t\t\t{I['widgetTarget']} /* P2000 Apeldoorn Widgets */,
\t\t\t\t{I['watchWidgetTarget']} /* P2000 Apeldoorn Watch Widgets */,
\t\t\t\t{I['tvTarget']} /* P2000 Apeldoorn TV */,
\t\t\t\t{I['nsTarget']} /* P2000 Apeldoorn Notifications */,
\t\t\t);
\t\t}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t{I['widgetResources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['wwResources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['appResources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['watchResources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['tvResources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['nsResources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t{I['widgetSources']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['wwSources']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['appSources']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['watchSources']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['tvSources']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{I['nsSources']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXSourcesBuildPhase section */

/* Begin PBXTargetDependency section */
\t\t{I['depWidget']} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {I['widgetTarget']} /* P2000 Apeldoorn Widgets */;
\t\t\ttargetProxy = {I['proxyWidget']} /* PBXContainerItemProxy */;
\t\t}};
\t\t{I['depWW']} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {I['watchWidgetTarget']} /* P2000 Apeldoorn Watch Widgets */;
\t\t\ttargetProxy = {I['proxyWW']} /* PBXContainerItemProxy */;
\t\t}};
\t\t{I['depWatch']} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\tplatformFilters = (ios, );
\t\t\ttarget = {I['watchTarget']} /* P2000 Apeldoorn Watch */;
\t\t\ttargetProxy = {I['proxyWatch']} /* PBXContainerItemProxy */;
\t\t}};
\t\t{I['depNS']} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {I['nsTarget']} /* P2000 Apeldoorn Notifications */;
\t\t\ttargetProxy = {I['proxyNS']} /* PBXContainerItemProxy */;
\t\t}};
/* End PBXTargetDependency section */

/* Begin XCBuildConfiguration section */
{xcconf(I['projDebug'], 'Debug', proj_debug, I['baseXC'])}{xcconf(I['projRelease'], 'Release', proj_release, I['baseXC'])}{xcconf(I['appDebug'], 'Debug', app)}{xcconf(I['appRelease'], 'Release', app)}{xcconf(I['watchDebug'], 'Debug', watch)}{xcconf(I['watchRelease'], 'Release', watch)}{xcconf(I['widgetDebug'], 'Debug', widget)}{xcconf(I['widgetRelease'], 'Release', widget)}{xcconf(I['wwDebug'], 'Debug', watch_widget)}{xcconf(I['wwRelease'], 'Release', watch_widget)}{xcconf(I['tvDebug'], 'Debug', tv)}{xcconf(I['tvRelease'], 'Release', tv)}{xcconf(I['nsDebug'], 'Debug', notifications)}{xcconf(I['nsRelease'], 'Release', notifications)}/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t{I['widgetList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Widgets" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I['widgetDebug']} /* Debug */,
\t\t\t\t{I['widgetRelease']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I['wwList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Watch Widgets" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I['wwDebug']} /* Debug */,
\t\t\t\t{I['wwRelease']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I['projList']} /* Build configuration list for PBXProject "P2000Apeldoorn" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I['projDebug']} /* Debug */,
\t\t\t\t{I['projRelease']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I['appList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I['appDebug']} /* Debug */,
\t\t\t\t{I['appRelease']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I['watchList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Watch" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I['watchDebug']} /* Debug */,
\t\t\t\t{I['watchRelease']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I['tvList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn TV" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I['tvDebug']} /* Debug */,
\t\t\t\t{I['tvRelease']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{I['nsList']} /* Build configuration list for PBXNativeTarget "P2000 Apeldoorn Notifications" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{I['nsDebug']} /* Debug */,
\t\t\t\t{I['nsRelease']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
/* End XCConfigurationList section */

\t}};
\trootObject = {I['project']} /* Project object */;
}}
"""
os.makedirs(os.path.join(root, "P2000Apeldoorn.xcodeproj/project.xcworkspace/xcshareddata"), exist_ok=True)
open(os.path.join(root, "P2000Apeldoorn.xcodeproj/project.pbxproj"), "w").write(pbx)
open(os.path.join(root, "P2000Apeldoorn.xcodeproj/project.xcworkspace/contents.xcworkspacedata"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<Workspace\n   version = "1.0">\n   <FileRef\n      location = "self:">\n   </FileRef>\n</Workspace>\n')
print("ok")
