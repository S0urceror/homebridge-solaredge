import { Service, PlatformAccessory, CharacteristicValue, Characteristic } from 'homebridge';
import { ModbusHomebridgePlatform } from './platform';
import { CurrentPowerConsumption, TotalPowerConsumption, ResetTotalPowerConsumption, Volt,Ampere } from './customCharacteristics';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SolarEdgeStateAccessory {
  private historyService;
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    CurrentTemperature: 21.0,
  };

  constructor(
    private readonly platform: ModbusHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SolarEdge')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the TemperatureSensor service if it exists, otherwise create a new TemperatureSensor service
    // you can create multiple services for each accessory
    const temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) || this.accessory.addService(this.platform.Service.TemperatureSensor);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/CurrentTemperature

    temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .onGet(this.getCurrentTemperature.bind(this));

    setInterval(() => {
      const moment = Math.round(new Date().valueOf() / 1000);
      this.historyService.addEntry ({time:moment, temp: this.exampleStates.CurrentTemperature});
    }, 10000);

    // Add FakeGato history service
    this.historyService = new this.platform.FakeGatoHistoryService ("custom",this.accessory,{log:this.platform.log});
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.
  */

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const temp = this.exampleStates.CurrentTemperature;

    this.platform.log.debug('Get Characteristic On ->', temp);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return temp;
  }
}

export class SolarEdgeACAccessory {
  private historyService;
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Watt: 50,
    Energy: 12345,
    Ampere: 4,
    Volt: 230.4
  };

  constructor(
    private readonly platform: ModbusHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SolarEdge')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */
    const OutletService = this.accessory.getService(this.platform.Service.Outlet) || this.accessory.addService(this.platform.Service.Outlet);
    // register handlers for the On/Off Characteristic
    OutletService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below
    // register handlers for TotalPowerConsumption
    OutletService.getCharacteristic(TotalPowerConsumption)
      .onGet(this.getEnergy.bind(this));       // GET - bind to the 'getEnergy` method below
    // register handlers for TotalPowerConsumption
    OutletService.getCharacteristic(CurrentPowerConsumption)
      .onGet(this.getWatt.bind(this));       // GET - bind to the 'getWatt` method below
    OutletService.getCharacteristic(Volt)
      .onGet(this.getVoltage.bind(this));       // GET - bind to the 'getWatt` method below
    OutletService.getCharacteristic(Ampere)
      .onGet(this.getAmpere.bind(this));       // GET - bind to the 'getWatt` method below

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */

    /*
    let motionDetected = false;
    setInterval(() => {
      // EXAMPLE - inverse the trigger
      motionDetected = !motionDetected;

      // push the new value to HomeKit
      motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
      motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

      this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
      this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
      
      const moment = Math.round(new Date().valueOf() / 1000);
      this.historyService.addEntry ({time:moment,power:50});

    }, 10000);
    */

    setInterval(() => {
      const moment = Math.round(new Date().valueOf() / 1000);
      this.historyService.addEntry ({time:moment, power: this.exampleStates.Watt});
    }, 10000);

    // Add FakeGato history service
    this.historyService = new this.platform.FakeGatoHistoryService ("custom",this.accessory,{log:this.platform.log});
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    this.exampleStates.On = value as boolean;

    this.platform.log.debug('Set Characteristic On ->', value);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const isOn = this.exampleStates.On;

    this.platform.log.debug('Get Characteristic On ->', isOn);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn;
  }

  async getWatt(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const watt = this.exampleStates.Watt;

    this.platform.log.debug('Get Characteristic On ->', watt);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return watt;
  }
  async getEnergy(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const energy = this.exampleStates.Energy;

    this.platform.log.debug('Get Characteristic On ->', energy);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return energy;
  }
  async getVoltage(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const volt = this.exampleStates.Volt;

    this.platform.log.debug('Get Characteristic On ->', volt);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return volt;
  }  
  
  async getAmpere(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const ampere = this.exampleStates.Ampere;

    this.platform.log.debug('Get Characteristic On ->', ampere);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return ampere;
  }
}

export class SolarEdgeDCAccessory {
  private historyService;
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: true,
    Watt: 50,
    Energy: 12345,
    Ampere: 4,
    Volt: 230.4
  };

  constructor(
    private readonly platform: ModbusHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SolarEdge')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */
    const OutletService = this.accessory.getService(this.platform.Service.Outlet) || this.accessory.addService(this.platform.Service.Outlet);
    // register handlers for the On/Off Characteristic
    OutletService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below
    // register handlers for TotalPowerConsumption
    OutletService.getCharacteristic(TotalPowerConsumption)
      .onGet(this.getEnergy.bind(this));       // GET - bind to the 'getEnergy` method below
    // register handlers for TotalPowerConsumption
    OutletService.getCharacteristic(CurrentPowerConsumption)
      .onGet(this.getWatt.bind(this));       // GET - bind to the 'getWatt` method below
    OutletService.getCharacteristic(Volt)
      .onGet(this.getVoltage.bind(this));       // GET - bind to the 'getWatt` method below
    OutletService.getCharacteristic(Ampere)
      .onGet(this.getAmpere.bind(this));       // GET - bind to the 'getWatt` method below

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */

    /*
    let motionDetected = false;
    setInterval(() => {
      // EXAMPLE - inverse the trigger
      motionDetected = !motionDetected;

      // push the new value to HomeKit
      motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
      motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

      this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
      this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
      
      const moment = Math.round(new Date().valueOf() / 1000);
      this.historyService.addEntry ({time:moment,power:50});

    }, 10000);
    */

    setInterval(() => {
      const moment = Math.round(new Date().valueOf() / 1000);
      this.historyService.addEntry ({time:moment, power: this.exampleStates.Watt});
    }, 10000);

    // Add FakeGato history service
    this.historyService = new this.platform.FakeGatoHistoryService ("custom",this.accessory,{log:this.platform.log});
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    this.exampleStates.On = value as boolean;

    this.platform.log.debug('Set Characteristic On ->', value);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const isOn = this.exampleStates.On;

    this.platform.log.debug('Get Characteristic On ->', isOn);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn;
  }

  async getWatt(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const watt = this.exampleStates.Watt;

    this.platform.log.debug('Get Characteristic On ->', watt);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return watt;
  }
  async getEnergy(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const energy = this.exampleStates.Energy;

    this.platform.log.debug('Get Characteristic On ->', energy);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return energy;
  }
  async getVoltage(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const volt = this.exampleStates.Volt;

    this.platform.log.debug('Get Characteristic On ->', volt);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return volt;
  }  
  
  async getAmpere(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const ampere = this.exampleStates.Ampere;

    this.platform.log.debug('Get Characteristic On ->', ampere);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return ampere;
  }
}