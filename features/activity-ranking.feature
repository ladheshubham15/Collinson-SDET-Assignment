Feature: City-based activity ranking from a seven-day weather forecast
  The API returns daily suitability rankings for four activities using weather data.

  Background:
    Given the Activity Ranking API is available

  @location
  Scenario: Rank activities for an exact city name
    When I request activity rankings for "Lisbon"
    Then the response status should be 200
    And the response should contain a seven-day forecast
    And every forecast day should include all supported activities
    And every activity result should include a date, suitability and reasoning

  @location @partial-match
  Scenario: Return candidate locations for a partial city name
    When I request activity rankings for the partial location "San"
    Then the response status should be 200
    And the response should contain location matches
    And every location match should include a name and coordinates

  @validation
  Scenario: Reject a missing location
    When I request activity rankings without a location
    Then the response status should be 400
    And the error response should explain that location is required

  @validation
  Scenario: Reject a location that contains only whitespace
    When I request activity rankings for "   "
    Then the response status should be 400
    And the error response should explain that location is required

  @validation
  Scenario: Return no-match response for an unknown city
    When I request activity rankings for "zzqv-unmapped-town-94821"
    Then the response status should be 404
    And the error response should explain that no location matched

  @contract
  Scenario: Provide one result for each supported activity on every forecast day
    When I request activity rankings for "Reykjavik"
    Then the response status should be 200
    And every forecast day should include all supported activities
    And no forecast date should be duplicated

  @contract
  Scenario: Keep suitability scores within the documented range
    When I request activity rankings for "Reykjavik"
    Then the response status should be 200
    And every suitability score should be between 0 and 100 inclusive

  @ranking
  Scenario: Order each day's activities from most suitable to least suitable
    When I request activity rankings for "Reykjavik"
    Then the response status should be 200
    And activities for each day should be ordered by descending suitability

  @quality
  Scenario: Explain the weather factors behind every activity score
    When I request activity rankings for "Reykjavik"
    Then the response status should be 200
    And every activity result should include non-empty reasoning

  @dependency
  Scenario: Return an upstream error when the weather provider is unavailable
    Given the weather provider is configured to fail
    When I request activity rankings for "Oslo"
    Then the response status should be 502
    And the error response should explain that forecast data is temporarily unavailable
