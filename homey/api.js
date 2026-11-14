'use strict';

// App API for the settings page and the widget.
module.exports = {
  async getInfo({ homey }) {
    return homey.app.info();
  },
  async getLaatste({ homey }) {
    return homey.app.laatste(2);
  },
  async getAfbeelding({ homey }) {
    return homey.app.afbeeldingVoorbeeld();
  },
  async postTestMelding({ homey }) {
    return homey.app.testMelding();
  },
  async getRecent({ homey }) {
    return homey.app.recent();
  },
};
