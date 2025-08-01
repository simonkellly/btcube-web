// Types to recieve:
// 160 - CubeDisconnect
// 161 - CubeInfo
// 162 - ??? (Presumably RequestCubeReset)
// 163 - CubeStatus
// 164 - CubePower
// 165 - CubeMove
// 168 - CubeMoveHistory
// 170 - CubeBindAccount
// 171 - CubeGyroUpdate
// 172 - CubeGyroOperation
// 173 - CubeChangeName
// 174 - CubeSolving

// Functions to send:
// - RequestCubeInfo - 161
// - RequestCubeReset - 162
// - RequestCubeStatus - 163
// - RequestCubePower - 164
// - RequestCubeMoveHistory - 168
// - RequestBindAccount - 170
// - RequestCubeGyroOperation - 172
// - RequestCubeChangeName - 173
// - RequestCubeSolving - 174


/* 161 -> 
ReceiverToUnity -> CubeInfo -> GameEntry.Event.Fire(CubeInfoEventArgs.EventId)
DataBluetoothManager Subscribes with OnCubeInfoUpdateData
OnCubeInfoUpdateData -> OnThreeCubeInfoUpdateData -> SendEvent(196868u)
DeviceManagerPart Subscribes with OnCubeCreateSuccessEvent OnUpdateData

OnUpdateData -> RequestOther -> CubeStatus and Power
             -> SetData and UpdateGyroPower
*/

public class BluetoothCubeEntity : EntityCubeBase
{
    // Called when beginning to use the cube in some sort of way
	protected override void OnShow(object userData);
	
    // Opposite of OnShow
    protected override void OnHide(bool isShutdown, object userData);
	
    // I think that this just syncs that the current cube that is being used is a particular connected mac address?
    public void Init(bool sendeveent = true);
	
    // Cleanup meathod for the class
    public void DeInit();
	
    // When setting the cube settings, we call set data and then update gyro power
    // This sets up if the cube is capible of gyro and using it
    public void UpdateGyroPower();
	
    // Basically just sets gyro settings, BluetoothCubeData contains the update settings for the cube
    public void SetData(BluetoothCubeData data);
	
    // Monobehaviour update method, Time.deltaTime, Time.unscaledDeltaTime
    // Calls CheckStepLoss on each of the cached moves after InitState is set
    protected override void OnUpdate(float elapseSeconds, float realElapseSeconds);
	
    // Called by a cube event
    private void OnCubeGyroUpdateEvent(object sender, GameEventArgs e);
	
    // Does some sort of error checking in gyro?
    private void CalCulateGyroError(Vector3 eulerAngles);
	
    // Called by a cube event, adds moves to the move cache to be processed in the update method
	private void OnCubeMove(object sender, GameEventArgs e);

    // This is the primary move processing method called by OnUpdate from the move cache
	private void CheckStepLoss(int step, CubeMoveType[] expressionIds, int[] expressionTimes);

    // Unused move reset method
	private void ClearMove();
	
    // Called when processing moves after checking for step loss
    private void Move(int step, CubeMoveType emove, long time, string arrowColorString = "#FF0000");

    // Called by a cube event, sets the puzzle state (edges/corners etc.)
	public void OnCubeStatusSyncEvent(object sender, GameEventArgs gameEventArgs);
	
    // Called by a cube event following disconnect
    private void OnCubeDisConnect(object sender, GameEventArgs e);

    // Gets the saved cube macAddress
	public string GetCubeAddress();

    // Checks via the bluetooth implementation if the cube is connected
	public override bool IsConnected();
	
    // Some sort of reset method?
    public override void ResetCube();
	
    // Sets the cube state and moveIdx to -1 from facelets
    public override void SetCubeState(string facelets);

    // Unused move method from the base class
	public override void Move(string operates, bool isAnima = true, string arrowColorString = "#FF0000", bool isShowArrow = false);
	
    // Sends a reset packet to the cube to solved state
    public void RestoreSync();

    // Requests the cube status from the cube
	public void RequestCubeStatus();
	
    // Gets a list of moves from the recieved move history
    public List<CubeMoveOperate> GetHistory(int length, int skipEndIndex = 0);
	
    // Clears the recieved move history
    public void ClearHistory();
	
    // Takes an axial move, and redirects '/ / 2 with corrct MoveAxialOne parameters
    public void MoveAxial(string axial);
	
    // Logic for MoveAxial (x, y, z) -> This appears to be something to do with the visuals for the cube
    public void MoveAxialOne(string axial, int num, bool inv);

    // Non relative version of MoveAxial
	public void MoveAxialAbsolute(string axial);
	
    // Non relative version of MoveAxialOne
    public void MoveAxialOneAbsolute(string axial, int num, bool inv);
}

public class DeviceManagerPart : Singleton<DeviceManagerPart>
{
    // Subscribes to BluetoothConnect and Disconnect, CubeBindAccount, CubeCreateSuccess, CubeUpdateData, and GameSettingUpdate (OnSettingUpdateData)
	private DeviceManagerPart();

    // Gets macAddress of actually connected Cube from Entity saved Cube addresses
	public void GetcurrentAddress();

    // Sets up from previously saved device
	public void Init(UIDeviceManagerForm uiForm);

    // Used from UI when doing BindAccount
	public TBindDevice GetLastBindDeviceInfo();

    // From UI gyro settings
	private object OnSettingUpdateData(object pSender);

    // I think that this is to update cube settings from the UI? calls the setdata and updategyropower as above
	private object OnUpdateData(object psender);

    // Called by a cube event
	private void OnCubeBindAccountEvent(object sender, GameEventArgs e);

    // This uses data from GameEntry.Bluetooth.GetDevice -> which uses the BluetoothComponent OnScanResultEvent and a BluetoothDevice from the Protocol?
    // Pretty sure this then sets up the BluetoothCubeEntity with the macaddress
	public async void OnBluetoothConnectedEvent(object data, GameEventArgs e);

    // I forgot to look into what this was
	public void OnBluetoothDisConnectEvent(object data, GameEventArgs e);

    // Checks if the cube needs a firmware update
	private async void CheckIsNeedUpdate(string address);

    // Creates a new cube entity with macaddress
	private void CreateCube(string address);

    // Called by the application when a cube successfully initalises
    // Also calls InitDeviceInfo
	private object OnCubeCreateSuccessEvent(object pSender);

    // Need to look more into this, seems to be a disconnecting after failed attepts to RequestDeviceInfo?
    // So this asks for the device info, and then 2 seconds later while it does ask again, its purpose is actually just to disconnect the cube
    // i.e. there is a 2 second timeout on having a successful info request. The timer is removed onupdatedata
	private void InitDeviceInfo(DeviceType type, string address);

    // Requests the device info from the cube (I think eventually calls OnUpdateData once cube responds)
	private void RequestDeviceInfo(DeviceType type, string address);

    // Requests additional info from the cub efrom OnUpdateData
    // CubeStatus and CubePower
	private void RequestOther(DeviceType type, string address);

    // Adds a device which the user can automatically connect to
	public void AddAutoLinkDevice(string address);

    // Removes a device which the user can automatically connect to
	public void RemoveAutoLinkDevice(string address);

    // Checks if the device is one to be automatically connected to
    // Perhaps we can do this with device name? and automatically save the person from clicking connect cube etc.??
    // Might be an implementation thing and outside the scope of the library
	public bool CanAutoLink(string address);

    // Gets the bluetoth device of the MainCube macaddress (used to get model name)
	public BluetoothDevice GetMainDevice();

    // Gets the bluetoth device of a specific type (used to get model name)
	public BluetoothDevice GetDevice(DeviceType type);

    // Gets the public cube type name - Used in the UI
	public string GetMainDeviceModelName();

    // Gets the public device type name - Used in the UI
	public string GetDeviceModelName(DeviceType type);

    // Removes a cube from users account
	public void Request_UnbindDevice(string address, Action callback);

    // Checks if a cube is bound toa users account
	public void Request_CheckBindState(string macAddress, Action<TBindDevice> callback);
}
