@mock
Feature: Activity ranking behaviour verified against a mocked API
  Runs the same step definitions as the spec suite, but against an in-process mock of the
  Activity Ranking API that is backed by the stubbed Open-Meteo. It shows the assertions can pass
  and documents one complete, conforming interaction for each behaviour.

  Scenario: Partial name returns candidate locations
    When I search for locations matching "San"
    Then the response status should be 200
    And the location matches should be exactly "San Diego, San Francisco, San Jose"
    And every location match should include a name, country and coordinates

  Scenario: A blank search query is rejected
    When I search for locations with query "   "
    Then the response status should be 400
    And the error response should explain that query is required

  Scenario: A sunny week produces a complete, ordered seven-day ranking
    Given Open-Meteo reports a sunny week for "Lisbon"
    When I request activity rankings for "Lisbon"
    Then the response status should be 200
    And the ranked location should be "Lisbon"
    And the forecast should cover the seven dates served by Open-Meteo
    And every forecast day should include all supported activities
    And every activity result should include a date, rank, suitability and reasoning
    And every suitability score should be between 0 and 100 inclusive
    And activities for each day should be ordered by descending suitability
    And ranks for each day should run from 1 to 4 in order
    And on every day "Outdoor Sightseeing" should score higher than "Indoor Sightseeing"
    And the reasoning for "Outdoor Sightseeing" on every day should mention "22"

  Scenario: Heavy snowfall favours skiing
    Given Open-Meteo reports a snowy week for "Zermatt"
    When I request activity rankings for "Zermatt"
    Then the response status should be 200
    And on every day "Skiing" should rank first
    And the reasoning for "Skiing" on every day should mention "snow"

  Scenario: Heavy rain favours indoor sightseeing
    Given Open-Meteo reports a rainy week for "Oslo"
    When I request activity rankings for "Oslo"
    Then the response status should be 200
    And on every day "Indoor Sightseeing" should rank first
    And the reasoning for "Outdoor Sightseeing" on every day should mention "rain"

  Scenario: Large waves favour surfing
    Given Open-Meteo reports a surf week for "Lisbon"
    When I request activity rankings for "Lisbon"
    Then the response status should be 200
    And on every day "Surfing" should score higher than "Skiing"
    And the reasoning for "Surfing" on every day should mention "wave"

  Scenario: The forecast is requested from Open-Meteo for seven days
    Given Open-Meteo reports a sunny week for "Lisbon"
    When I request activity rankings for "Lisbon"
    Then Open-Meteo should have been asked to geocode "Lisbon"
    And Open-Meteo should have been asked for a seven-day forecast at the coordinates of "Lisbon"

  Scenario: An unknown city is a 404 and no forecast is requested
    When I request activity rankings for "zzqv-unmapped-town-94821"
    Then the response status should be 404
    And the error response should explain that no location matched
    And Open-Meteo should not have been asked for a forecast

  Scenario: A missing location is rejected without calling Open-Meteo
    When I request activity rankings with location "<absent>"
    Then the response status should be 400
    And the error response should explain that location is required
    And Open-Meteo should not have been called

  Scenario: A forecast outage becomes a 502
    Given Open-Meteo reports a sunny week for "Oslo"
    And the Open-Meteo forecast service is failing
    When I request activity rankings for "Oslo"
    Then the response status should be 502
    And the error response should explain that forecast data is temporarily unavailable
