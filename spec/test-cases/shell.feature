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
