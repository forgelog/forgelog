plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
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
        versionCode = 362000102
        versionName = "0.1.2"

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
            isMinifyEnabled = false
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
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

    // Wear Compose — real Wear OS widgets (SwipeDismissableNavHost, Stepper, etc.),
    // not the phone androidx.compose.material set.
    implementation("androidx.wear.compose:compose-material:1.4.1")
    implementation("androidx.wear.compose:compose-foundation:1.4.1")
    implementation("androidx.wear.compose:compose-navigation:1.4.1")
    implementation("androidx.wear:wear-tooling-preview:1.0.0")
    implementation("androidx.compose.ui:ui-tooling-preview:1.7.6")
    debugImplementation("androidx.compose.ui:ui-tooling:1.7.6")

    // Room is the on-watch write-ahead log / session source of truth.
    implementation("androidx.room:room-runtime:2.7.1")
    implementation("androidx.room:room-ktx:2.7.1")
    ksp("androidx.room:room-compiler:2.7.1")

    // Data Layer API — talks to the phone.
    implementation("com.google.android.gms:play-services-wearable:19.0.0")

    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
