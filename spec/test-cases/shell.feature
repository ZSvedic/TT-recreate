# #WebUI #TutorialMode
# Browser-shell scenarios: the built app driven in headless Chromium — the
# integration seams Node-driven controller scenarios cannot see (spotlight
# overlay anchors, sheet raising, real DOM). Kept few and flow-shaped.
Feature: Browser shell

  Rule: A tour spotlights each step's live UI anchor

    @web
    Scenario: The filter tour spotlights Open, the chat input, then the Voilà table stop
      Given the built web app in a browser
      When the app opens the deep link "?feature=filter.feature&scenario=Filter+by+Country"
      Then the tour popover is visible
      And the tour progress reads "1 of 3"
      And the tour spotlight targets the empty-page Open button
      When the user clicks the tour Next button
      Then the tour spotlight targets the chat input
      And the browser chat input is prefilled with "Show only customers in the USA"
      When the user clicks the tour Next button
      Then the tour popover shows the completion message for "Filter by Country"
      And the tour progress reads "3 of 3"
      And the tour spotlight targets the table
      And the tour Next button is disabled
      When the user clicks the tour Finish button
      Then the tours panel is open in the browser

    @web
    Scenario: On a phone the query step raises the Type sheet under the spotlight
      Given the built web app in a browser at 390x844
      When the app opens the deep link "?feature=filter.feature&scenario=Filter+by+Country"
      Then the tour spotlight targets the empty-page Open button
      When the user clicks the tour Next button
      Then the mobile Type sheet is raised
      And the tour spotlight targets the mobile composer

  Rule: On a phone the page scrolls the table under pinned chrome

    @web
    Scenario: The phone page is the table's scroller with frozen header and index
      Given the built web app in a browser at 390x844
      When the browser user opens the sample "paginate-input.csv"
      Then the page has vertical scroll room
      And the table region does not scroll internally
      And the app bar is pinned
      And the dock is pinned
      And the table header row sticks below the app bar
      And the row-index column sticks to the left edge

    @web
    Scenario: Even the empty phone page keeps a bar's worth of scroll room
      Given the built web app in a browser at 390x844
      Then the page has vertical scroll room

    @web
    Scenario: On desktop nothing scrolls the page
      Given the built web app in a browser
      When the browser user opens the sample "paginate-input.csv"
      Then the page has no vertical scroll room

  Rule: The empty page offers every open path

    @web
    Scenario: The empty page asks the question and stacks the three open actions
      Given the built web app in a browser
      Then the empty page shows "What table can I tame?"
      And the empty page offers the buttons "Open sample…", "Open local…" and "Open URL…"
      And the empty page links "Or start one of the tours"
      When the browser user clicks the empty-page tours link
      Then the tours panel is open in the browser

  Rule: Toolbar tooltips name their CLI equivalents

    @web
    Scenario: Undo, Redo and the saves carry CLI-equivalent tooltips
      Given the built web app in a browser
      Then the toolbar button "Undo" has the tooltip "Undo (:undo)"
      And the toolbar button "Redo" has the tooltip "Redo (:redo)"
      And the toolbar button "Save data" has the tooltip "Save the current rows (:save)"
      And the toolbar button "Save flow" has the tooltip "Save the flow as a replayable .flow file (:save-flow)"

  Rule: The save split-buttons list every format

    @web
    Scenario: Save data offers all four formats and Save flow offers Flow and Python
      Given the built web app in a browser
      When the browser user opens the sample "customers-input.csv"
      Then the "save-data" menu lists "Save as CSV…", "Save as JSONL…", "Save as Parquet…", "Save as Arrow…"
      And the "save-flow" menu lists "Save as Flow…", "Save as Python…"

  Rule: The URL dialog reports failures inline

    @web
    Scenario: A failing URL shows an inline error and the dialog stays open
      Given the built web app in a browser
      When the browser user opens the URL dialog
      And the browser user submits the URL "https://localhost:1/missing.csv"
      Then the URL dialog shows an inline error
      And the URL dialog is still open
      And no browser toast is shown

    @web
    Scenario: An http URL shows a soft unencrypted hint
      Given the built web app in a browser
      When the browser user opens the URL dialog
      And the browser user types the URL "http://example.com/data.csv"
      Then the URL dialog shows an unencrypted hint

  Rule: Diagnostics actions live in Settings

    @web
    Scenario: Settings offers the three diagnostics actions
      Given the built web app in a browser
      When the browser user opens Settings from the toolbar
      Then the settings panel offers the diagnostics actions

    @web
    Scenario: An error toast carries a Copy report action
      Given the built web app in a browser
      When the browser user opens the sample "customers-input.csv"
      And the browser user sends the chat message "normalize phone numbers"
      Then the newest browser toast carries the action "Copy report"

  Rule: Add to home screen lives in phone Settings only

    @web
    Scenario: Phone Settings ends with the Add-to-home-screen section
      Given the built web app in a browser at 390x844
      When the browser user opens Settings from the dock menu
      Then the Add to home screen section is shown

    @web
    Scenario: Desktop Settings has no Add-to-home-screen section
      Given the built web app in a browser
      When the browser user opens Settings from the toolbar
      Then the Add to home screen section is absent
