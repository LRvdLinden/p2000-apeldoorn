#!/usr/bin/env python3
"""Generates beheer/P2000Beheer.xcodeproj: one multiplatform app target (iPhone, iPad, Mac), Xcode 16+ synchronized folder."""
import hashlib, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def oid(name):
    return hashlib.md5(("p2000beheer-" + name).encode()).hexdigest()[:24].upper()

BUNDLE = "nl.lrvdlinden.p2000beheer"
I = {k: oid(k) for k in ["project", "main", "products", "config", "grpApp", "appProduct", "appTarget", "appSources",
                         "appResources", "appFrameworks", "projDebug", "projRelease", "projList", "appDebug", "appRelease", "appList"]}
config_files = ["Base.xcconfig", "P2000Beheer-Info.plist", "P2000Beheer-iOS.entitlements", "P2000Beheer-macOS.entitlements"]
cfg = {f: oid("cfg-" + f) for f in config_files}

def ftype(f):
    return {"xcconfig": "text.xcconfig", "plist": "text.plist.xml", "entitlements": "text.plist.entitlements"}[f.rsplit(".", 1)[1]]

def settings(d, indent="\t\t\t\t"):
    out = []
    for k, v in d.items():
        if "[" in k: k = '"' + k + '"'
        sv = str(v)
        if not sv or any(c in sv for c in ' $(),;=-/+:*[]"@'):
            sv = '"' + sv.replace('"', '\\"') + '"'
        out.append(f"{indent}{k} = {sv};")
    return "\n".join(out)

common = {
    "ALWAYS_SEARCH_USER_PATHS": "NO", "ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS": "YES",
    "CLANG_ENABLE_MODULES": "YES", "CLANG_ENABLE_OBJC_ARC": "YES", "ENABLE_STRICT_OBJC_MSGSEND": "YES",
    "ENABLE_USER_SCRIPT_SANDBOXING": "YES", "GCC_C_LANGUAGE_STANDARD": "gnu17", "LOCALIZATION_PREFERS_STRING_CATALOGS": "YES",
    "SWIFT_VERSION": "5.0", "IPHONEOS_DEPLOYMENT_TARGET": "18.0", "MACOSX_DEPLOYMENT_TARGET": "15.0",
}
proj_debug = dict(common, DEBUG_INFORMATION_FORMAT="dwarf", ENABLE_TESTABILITY="YES", GCC_OPTIMIZATION_LEVEL="0",
                  ONLY_ACTIVE_ARCH="YES", SWIFT_ACTIVE_COMPILATION_CONDITIONS="DEBUG $(inherited)", SWIFT_OPTIMIZATION_LEVEL="-Onone")
proj_release = dict(common, DEBUG_INFORMATION_FORMAT="dwarf-with-dsym", ENABLE_NS_ASSERTIONS="NO",
                    SWIFT_COMPILATION_MODE="wholemodule", VALIDATE_PRODUCT="YES")
app = {
    "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
    "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
    "CODE_SIGN_ENTITLEMENTS[sdk=iphoneos*]": "Config/P2000Beheer-iOS.entitlements",
    "CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]": "Config/P2000Beheer-iOS.entitlements",
    "CODE_SIGN_ENTITLEMENTS[sdk=macosx*]": "Config/P2000Beheer-macOS.entitlements",
    "CODE_SIGN_STYLE": "Automatic",
    "COMBINE_HIDPI_IMAGES": "YES",
    "DEVELOPMENT_TEAM": "EU3UY476T6",
    "ENABLE_HARDENED_RUNTIME": "YES",
    "ENABLE_PREVIEWS": "YES",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_FILE": "Config/P2000Beheer-Info.plist",
    "INFOPLIST_KEY_CFBundleDisplayName": "P2000Beheer",
    "INFOPLIST_KEY_LSApplicationCategoryType": "public.app-category.utilities",
    "INFOPLIST_KEY_NSFaceIDUsageDescription": "Gebruik Face ID om P2000Beheer te openen.",
    "INFOPLIST_KEY_NSHumanReadableCopyright": "© 2026 P2000 Apeldoorn · PixelForges",
    "INFOPLIST_KEY_UIApplicationSceneManifest_Generation[sdk=iphoneos*]": "YES",
    "INFOPLIST_KEY_UIApplicationSceneManifest_Generation[sdk=iphonesimulator*]": "YES",
    "INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents[sdk=iphoneos*]": "YES",
    "INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents[sdk=iphonesimulator*]": "YES",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad": "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone": "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphoneos*]": "$(inherited) @executable_path/Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=iphonesimulator*]": "$(inherited) @executable_path/Frameworks",
    "LD_RUNPATH_SEARCH_PATHS[sdk=macosx*]": "$(inherited) @executable_path/../Frameworks",
    "PRODUCT_BUNDLE_IDENTIFIER": BUNDLE,
    "PRODUCT_MODULE_NAME": "P2000Beheer",
    "PRODUCT_NAME": "P2000Beheer",
    "SDKROOT": "auto",
    "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator macosx",
    "SUPPORTS_MACCATALYST": "NO",
    "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD": "NO",
    "SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD": "NO",
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

def phase(key, isa, name):
    return f"""\t\t{key} /* {name} */ = {{
\t\t\tisa = {isa};
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
"""

def clist(key, comment, a, b):
    return f"""\t\t{key} /* {comment} */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{a} /* Debug */,
\t\t\t\t{b} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
"""

file_refs = "".join(f'\t\t{cfg[f]} /* {f} */ = {{isa = PBXFileReference; lastKnownFileType = {ftype(f)}; path = "{f}"; sourceTree = "<group>"; }};\n' for f in config_files)
cfg_children = "".join(f"\t\t\t\t{cfg[f]} /* {f} */,\n" for f in config_files)

pbx = f"""// !$*UTF8*$!
{{
\tarchiveVersion = 1;
\tclasses = {{
\t}};
\tobjectVersion = 77;
\tobjects = {{

/* Begin PBXFileReference section */
\t\t{I['appProduct']} /* P2000Beheer.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = P2000Beheer.app; sourceTree = BUILT_PRODUCTS_DIR; }};
{file_refs}/* End PBXFileReference section */

/* Begin PBXFileSystemSynchronizedRootGroup section */
\t\t{I['grpApp']} /* P2000Beheer */ = {{isa = PBXFileSystemSynchronizedRootGroup; path = P2000Beheer; sourceTree = "<group>"; }};
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
{phase(I['appFrameworks'], 'PBXFrameworksBuildPhase', 'Frameworks')}/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t{I['main']} = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{I['grpApp']} /* P2000Beheer */,
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
\t\t\t\t{I['appProduct']} /* P2000Beheer.app */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t{I['appTarget']} /* P2000Beheer */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {I['appList']} /* Build configuration list for PBXNativeTarget "P2000Beheer" */;
\t\t\tbuildPhases = (
\t\t\t\t{I['appSources']} /* Sources */,
\t\t\t\t{I['appFrameworks']} /* Frameworks */,
\t\t\t\t{I['appResources']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t{I['grpApp']} /* P2000Beheer */,
\t\t\t);
\t\t\tname = P2000Beheer;
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = P2000Beheer;
\t\t\tproductReference = {I['appProduct']} /* P2000Beheer.app */;
\t\t\tproductType = "com.apple.product-type.application";
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
\t\t\t\t}};
\t\t\t}};
\t\t\tbuildConfigurationList = {I['projList']} /* Build configuration list for PBXProject "P2000Beheer" */;
\t\t\tdevelopmentRegion = nl;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\tnl,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {I['main']};
\t\t\tminimizedProjectReferenceProxies = 1;
\t\t\tpreferredProjectObjectVersion = 77;
\t\t\tproductRefGroup = {I['products']} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t{I['appTarget']} /* P2000Beheer */,
\t\t\t);
\t\t}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
{phase(I['appResources'], 'PBXResourcesBuildPhase', 'Resources')}/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
{phase(I['appSources'], 'PBXSourcesBuildPhase', 'Sources')}/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
{xcconf(I['projDebug'], 'Debug', proj_debug, cfg['Base.xcconfig'])}{xcconf(I['projRelease'], 'Release', proj_release, cfg['Base.xcconfig'])}{xcconf(I['appDebug'], 'Debug', app)}{xcconf(I['appRelease'], 'Release', app)}/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
{clist(I['projList'], 'Build configuration list for PBXProject "P2000Beheer"', I['projDebug'], I['projRelease'])}{clist(I['appList'], 'Build configuration list for PBXNativeTarget "P2000Beheer"', I['appDebug'], I['appRelease'])}/* End XCConfigurationList section */
\t}};
\trootObject = {I['project']} /* Project object */;
}}
"""

proj = os.path.join(root, "P2000Beheer.xcodeproj")
os.makedirs(os.path.join(proj, "project.xcworkspace/xcshareddata"), exist_ok=True)
os.makedirs(os.path.join(proj, "xcshareddata/xcschemes"), exist_ok=True)
open(os.path.join(proj, "project.pbxproj"), "w").write(pbx)
open(os.path.join(proj, "project.xcworkspace/contents.xcworkspacedata"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<Workspace\n   version = "1.0">\n   <FileRef\n      location = "self:">\n   </FileRef>\n</Workspace>\n')
ref = f'<BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "{I["appTarget"]}" BuildableName = "P2000Beheer.app" BlueprintName = "P2000Beheer" ReferencedContainer = "container:P2000Beheer.xcodeproj"></BuildableReference>'
scheme = f"""<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "2600" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            {ref}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES"></TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         {ref}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         {ref}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug"></AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES"></ArchiveAction>
</Scheme>
"""
open(os.path.join(proj, "xcshareddata/xcschemes/P2000Beheer.xcscheme"), "w").write(scheme)
print("ok")
