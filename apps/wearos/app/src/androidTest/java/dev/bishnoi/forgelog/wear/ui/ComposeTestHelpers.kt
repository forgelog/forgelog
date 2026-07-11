package dev.bishnoi.forgelog.wear.ui

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performScrollToNode
import org.junit.Assert.assertTrue

fun ComposeContentTestRule.scrollToText(text: String) {
    onAllNodes(hasScrollAction())
        .onFirst()
        .performScrollToNode(hasText(text))
}

fun ComposeContentTestRule.assertNoContentDescription(
    contentDescription: String,
) {
    val matchingNodes = onAllNodes(
        hasContentDescription(contentDescription),
        useUnmergedTree = true,
    ).fetchSemanticsNodes()
    assertTrue(matchingNodes.isEmpty())
}

fun ComposeContentTestRule.assertNoText(text: String) {
    val matchingNodes = onAllNodes(hasText(text)).fetchSemanticsNodes()
    assertTrue(matchingNodes.isEmpty())
}

fun ComposeContentTestRule.assertPickerValue(
    label: String,
    value: String,
) {
    onNode(hasContentDescription(label), useUnmergedTree = true).assertIsDisplayed()
    val expected = "$label $value"
    val matchingNodes = onAllNodes(
        hasContentDescription(label),
        useUnmergedTree = true,
    ).fetchSemanticsNodes()
    assertTrue(
        "Expected $label picker to expose state description $expected",
        matchingNodes.any { node ->
            node.config.getOrNull(SemanticsProperties.StateDescription) == expected
        },
    )
}
