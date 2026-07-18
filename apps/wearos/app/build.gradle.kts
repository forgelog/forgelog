import kotlinx.kover.gradle.plugin.dsl.AggregationType
import kotlinx.kover.gradle.plugin.dsl.CoverageUnit
import kotlinx.kover.gradle.plugin.dsl.GroupingEntityType

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kover)
}

android {
    // Must match the mobile app's applicationId exactly: the Data Layer API
    // (Wearable.getDataClient) requires identical package name AND signing
    // certificate between the phone and watch app, or synced data silently
    // never crosses over. Verified empirically via paired emulator testing.
    namespace = "dev.bishnoi.forgelog.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.bishnoi.forgelog.mobile"
        minSdk = 30
        targetSdk = 36
        // versionCode must be unique across every form factor in this Play
        // listing. Scheme: [targetSdk:2][formFactor:1][version:6], where
        // version is major/minor/patch each zero-padded to 2 digits
        // (0.1.0 -> 000100). formFactor 1=mobile, 2=wear.
        versionCode = 362000104
        versionName = "0.1.4"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        getByName("debug") {
            storeFile = file(System.getProperty("user.home") + "/.android/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        create("release") {
            val storeFilePath = System.getenv("FORGELOG_RELEASE_STORE_FILE")
            if (storeFilePath != null) {
                storeFile = file(storeFilePath)
                storePassword = System.getenv("FORGELOG_RELEASE_STORE_PASSWORD")
                keyAlias = System.getenv("FORGELOG_RELEASE_KEY_ALIAS")
                keyPassword = System.getenv("FORGELOG_RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Same upload keystore as the mobile app (via the same env vars)
            // so both APKs carry an identical signing certificate.
            signingConfig = if (System.getenv("FORGELOG_RELEASE_STORE_FILE") != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    sourceSets {
        getByName("test") {
            resources.srcDirs("../../../data/contracts/fixtures")
        }
        getByName("androidTest") {
            assets.srcDirs("../../../data/contracts/fixtures")
        }
    }

    testOptions {
        managedDevices {
            localDevices {
                create("wearApi34") {
                    device = "Pixel 2"
                    apiLevel = 34
                    systemImageSource = "android-wear"
                    require64Bit = true
                    testedAbi = "x86_64"
                }
            }
        }
    }
}

kover {
    reports {
        filters {
            includes {
                classes(
                    "dev.bishnoi.forgelog.wear.logic.*",
                    "dev.bishnoi.forgelog.wear.sync.SyncSnapshot",
                    "dev.bishnoi.forgelog.wear.sync.*Dto",
                )
            }
        }
        verify {
            rule("wear-jvm-covered-surface") {
                minBound(60, CoverageUnit.LINE, AggregationType.COVERED_PERCENTAGE)
            }
            rule("wear-jvm-covered-surface-packages") {
                groupBy.set(GroupingEntityType.PACKAGE)
                minBound(44, CoverageUnit.LINE, AggregationType.COVERED_PERCENTAGE)
            }
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Wear Compose — real Wear OS widgets (SwipeDismissableNavHost, Stepper, etc.),
    // not the phone androidx.compose.material set.
    implementation(libs.androidx.wear.compose.material)
    implementation(libs.androidx.wear.compose.foundation)
    implementation(libs.androidx.wear.compose.navigation)
    implementation(libs.androidx.wear.tooling.preview)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    // Room is the on-watch write-ahead log / session source of truth.
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // Data Layer API — talks to the phone.
    implementation(libs.play.services.wearable)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.kotlinx.coroutines.test)
}
