package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.basicMarquee
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.material.ChipColors
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition

/**
 * Standard Wear list chrome: a curved [PositionIndicator] scrollbar hugging the
 * right edge, top/bottom vignette, and the ambient TimeText. Every
 * ScalingLazyColumn screen renders inside this so scroll feedback is consistent
 * (issue #3). Black background is the Wear Compose default.
 */
@Composable
fun ScrollScaffold(
    listState: ScalingLazyListState,
    content: @Composable () -> Unit,
) {
    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) },
    ) {
        content()
    }
}

/** Red-tinted chip colors for destructive actions (discard/delete) per the #28 mockup. */
@Composable
fun destructiveChipColors(): ChipColors = ChipDefaults.chipColors(
    backgroundColor = MaterialTheme.colors.error,
    contentColor = MaterialTheme.colors.onError,
    secondaryContentColor = MaterialTheme.colors.onError,
)

/**
 * Single-line title that horizontally marquee-scrolls only when it overflows,
 * so long exercise/routine names stay readable on a small round screen
 * (issues #28/#27) instead of truncating with an ellipsis.
 */
@Composable
fun MarqueeText(
    text: String,
    modifier: Modifier = Modifier,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.title3,
) {
    Text(
        text = text,
        style = style,
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Clip,
        textAlign = TextAlign.Center,
        modifier = modifier.basicMarquee(iterations = Int.MAX_VALUE),
    )
}
