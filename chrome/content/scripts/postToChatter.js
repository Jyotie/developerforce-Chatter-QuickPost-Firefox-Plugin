// Constants
const OAUTH_SPLITTER = "#"
const metaLength = 200;
const groupDescLength = 30;
const groupsText = 'My Profile/Groups';

// Messages 
const emptyPostMessage 	= 'Error: Feed Post can not be empty';
const emptyGroupMessage = 'Error: You must select a group';
const loggedInTitle 	= "Congratulations";
const loggedInMessage  	= "You have succesfully logged in to Salesforce";
const successTitle		= "Success! Post created";
const successMessage 	= "View in salesforce";

// obtain the window mediator
var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);

var user = null, userGroups = null, selectedGroup = null, authorized = false, logIn = false, clearData = true;

var imagesInitialized = 0;
var autocompleteGroups = new Array();

var panel 	= null;
var button 	= null;

var oauthConfig = {
	'authorize_url' : 'https://login.salesforce.com/services/oauth2/authorize',
	'response_type' : 'token',
	'client_id' 	: '3MVG9y6x0357HlecmEDCncgv7j2hLpHs6046y0kByYceLzGWgE2DnNFV7eAPL6QyEns._TWncCnR5Go8H4zYv',
	'client_secret' : '8629989312427648112',
	'redirect_uri' 	: 'https://login.salesforce.com/services/oauth2/success',
	'display' 		: 'popup',
	'state'			: 'chatterAuth',
	'reauth_url'	: 'https://login.salesforce.com/services/oauth2/token',
	'r_grant_type' 	: 'refresh_token'
}

var oauth = {
	'authorize_win' : null,
	'access_token' 	: null,
	'instance_url'	: null,
	'id_url'		: null,
	'refresh_token'	: null
}

/**
* This listener is added to the authorize popup window.
* Adds a progressListener to the window once the dom content is loaded.
*/
var windowListener = {
	onOpenWindow: function(xulWindow){
		wm.removeListener(this);
		chromeWindow = xulWindow.docShell
								.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
								.getInterface(Components.interfaces.nsIDOMWindow);
								
		chromeWindow.addEventListener("DOMContentLoaded", 
			function(){
				chromeWindow.getBrowser().addProgressListener(progressListener);
			}, 
			false
		);
	},
	
	onWindowTitleChange: function(aWindow, title){}, 
	onCloseWindow: function(window){}
}

/**
* This listener retrieves oauth data from authorize window.
* Defines an onLocationChange method that is called every time the location changes.
* Verifies current location expecting the success response to get oauth data.
*/
var progressListener = {
	onLocationChange: function(aProgress, aRequest, aURI){
		// authorized
		if(aURI.spec.indexOf(oauthConfig.redirect_uri) == 0 && aURI.spec.split(OAUTH_SPLITTER).length > 1){
			var message = aURI.spec.split("#")[1];
			oauth.access_token	= decodeURIComponent(message.match(/.*access_token=([^&]*)&.*/)[1]);
			oauth.instance_url	= decodeURIComponent(message.match(/.*instance_url=([^&]*)&.*/)[1]);
			oauth.id_url 	  	= decodeURIComponent(message.match(/.*id=([^&]*)&?.*/)[1]);
			oauth.refresh_token	= decodeURIComponent(message.match(/.*refresh_token=([^&]*)&.*/)[1]);
			
			// remove page from history
			oauth.authorize_win.content.location.replace(oauthConfig.redirect_uri);
			var browserHistory = Components.classes["@mozilla.org/browser/nav-history-service;1"].getService(Components.interfaces.nsIBrowserHistory);
			browserHistory.removePage(aURI);
			
			fetchUserInfo();
			
		}
		// denied
		else if(aURI.spec.split("error=access_denied").length > 1){
			if(oauth.authorize_win != null){
				oauth.authorize_win.close();
				oauth.authorize_win = null;
			}
		}
	},
	
	onStateChange: function(aWebProgress, aRequest, aFlag, aStatus){},
	onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot){},
	onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage){},
	onSecurityChange: function(aWebProgress, aRequest, aState){}
}

/**
* Initializes firefox extension
*/
function init(){
	panel 	= document.getElementById("thepanel");
	button 	= document.getElementById("post-to-chatter");
	
	if(oauth.access_token == null){
		authorize();
	}
	else if(logIn == true){
			panel.openPopup(button, "after_start");
			popup();
	}
}

/**
* Generates authorization url
*/
function generateAuthorizationUrl(){
	return oauthConfig.authorize_url + 
	"?response_type=" 	+ oauthConfig.response_type + 
	"&client_id=" 		+ oauthConfig.client_id + 
	"&redirect_uri=" 	+ encodeURIComponent(oauthConfig.redirect_uri) + 
	"&display=" 		+ oauthConfig.display +
	"&state="			+ oauthConfig.state;
}
	
/**
* Handles authorization flow
*/
function authorize(){
	wm.addListener(windowListener);
	oauth.authorize_win = window.open(
		generateAuthorizationUrl(),
		"Authorize",
		"width=800,height=600,centerscreen,location=yes"
	);
}

/**
* Reauthenticate user using the refresh token
* callback - callback function
* callbackParams - array with callback function params
*/
function reauth(callback, callbackParams){
	$.ajax({ 
		type: 'POST', 
		url: oauthConfig.reauth_url,
		data: {	
			'grant_type' 	: oauthConfig.r_grant_type,
			'client_id' 	: oauthConfig.client_id,
			'client_secret'	: oauthConfig.client_secret,
			'refresh_token'	: oauth.refresh_token
		},
		beforeSend: function(xhr) { 
			xhr.setRequestHeader('X-PrettyPrint', 1);
		}, 
		success: function(data) {
			// update oauth values
			oauth.access_token	= data.access_token;
			oauth.instance_url	= data.instance_url;
			oauth.id_url 	  	= data.id;
			
			// execute callback function
			if(callback != null){
				callback.apply(null,callbackParams);
			}
		}, 
		error: function(xhr, textStatus, errorThrown) {
			var error = JSON.parse(xhr.responseText);
			alert(error[0].message);
			logout();
			authorize();
		} 
	});
}

/**
* Gets user info from salesforce
*/
function fetchUserInfo(){
	if(authorized == false){
		authorized = true;
		$.ajax({ 
			type: 'GET', 
			url: oauth.id_url,
			data: {	
				'oauth_token' 	: oauth.access_token,
				'Format' 		: 'json',
				'Version'		: 'latest'
			},
			beforeSend: function(xhr) { 
				xhr.setRequestHeader('X-PrettyPrint', 1);
			}, 
			success: function(data) {
				initUserData(data);
			}, 
			error: function(xhr, textStatus, errorThrown) {
				authorized = false;
				if(xhr.responseText == 'Bad_OAuth_Token'){
					reauth(fetchUserInfo);
				}
			} 
		});
	}
}

/*
* Retrieves user data and init userGroups 
* @param data - json with userInfo from salesforce
*/
function initUserData(data){
	user = data.getElementsByTagName("user")[0];
	queryGroups();
}

/**
* Notifies user is logged in
* This function is called in initAutocompleteCallback method that is necessary to initalize popup
*/
function loggedIn(){
	if(oauth.authorize_win != null){
		logIn = true;
		oauth.authorize_win.close();
		oauth.authorize_win = null;
		notify(loggedInTitle, loggedInMessage, null);
	}
}

/**
* Performs a request to rest api that executes a query
* @param callback - method invoked to process the result
* @param q - query
*/
function query(callback, q){
	var url = user.getElementsByTagName("urls")[0]
				  .getElementsByTagName("query")[0]
				  .childNodes[0].nodeValue.replace('{version}', '20.0');
	$.ajax({ 
		type: 'GET', 
		url: url,
		data: {'q' : q},
		beforeSend: function(xhr) { 
			xhr.setRequestHeader('Content-type', 'application/json');
			xhr.setRequestHeader('Authorization', 'OAuth ' + oauth.access_token); 
			xhr.setRequestHeader('X-PrettyPrint', 1);
		}, 
		success: function(data) { 
			callback(data); 
		}, 
		error: function(xhr, textStatus, errorThrown) {
			if(errorThrown == 'Unauthorized'){
				callbackParams = [callback, q];
				reauth(query, callbackParams);
			}
			else{
				var error = JSON.parse(xhr.responseText);
				if(error[0].errorCode == 'INVALID_TYPE'){
					alert("Unable to retrieve groups, please check that chatter is enabled for your organization");
				}
				else{
					alert(error[0].message);
				}
				logout();
			}
		} 
	});
}

/**
* Performs a request to rest api that operates with sobjects
* @param callback - method invoked to process the result
* @param object - Object that will be used (Account, Contact, etc.)
* @param data
*/
function sobject(callback, object, data){
	var url = user.getElementsByTagName("urls")[0]
				  .getElementsByTagName("sobjects")[0]
				  .childNodes[0].nodeValue.replace('{version}', '21.0');
	$.ajax({ 
		type: "POST", 
		url: url + object, 
		data: data,
		beforeSend: function(xhr) { 
			xhr.setRequestHeader('Content-type', 'application/json');
			xhr.setRequestHeader('Authorization', 'OAuth ' + oauth.access_token); 
			xhr.setRequestHeader('X-PrettyPrint', 1);
		}, 
		success: function(data) { 
		  callback(data); 
		}, 
		error: function(xhr, textStatus, errorThrown) {
			if(errorThrown == 'Unauthorized'){
				callbackParams = [callback, object, data];
				reauth(sobject, callbackParams);
			}
			else{
				var error = JSON.parse(xhr.responseText);
				alert(error[0].message);
			}
		} 
	});
}

/*
* Query userGroups to rest api 
*/
function queryGroups(){
	var userId = user.getElementsByTagName('user_id')[0].childNodes[0].nodeValue.replace(/\'/g, "\\'");
	var q = "SELECT Id , CollaborationGroup.Name, CollaborationGroup.SmallPhotoUrl, CollaborationGroup.Description, CollaborationGroupId FROM CollaborationGroupMember where MemberId='" + userId + "' ORDER BY CollaborationGroup.Name";
	query(retrieveGroups, q);
}

/*
* Retrieves userGroups 
* @param data - json with userInfo from rest api
*/
function retrieveGroups(data){
	userGroups = new Array();
	
	userGroups[0] = {
		value	: user.getElementsByTagName('user_id')[0].childNodes[0].nodeValue, 
		label 	: 'My Profile',
		desc	: user.getElementsByTagName('display_name')[0].childNodes[0].nodeValue,
		icon	: user.getElementsByTagName('photos')[0].getElementsByTagName('thumbnail')[0].childNodes[0].nodeValue + "?oauth_token=" + oauth.access_token 
	}

	for(var i=0 ; i<data.records.length ; i++){
		userGroups[i+1] = {
			value 	: data.records[i].CollaborationGroupId , 
			label 	: data.records[i].CollaborationGroup.Name,
			desc	: data.records[i].CollaborationGroup.Description != null ? data.records[i].CollaborationGroup.Description : '',
			icon	: data.records[i].CollaborationGroup.SmallPhotoUrl + "?oauth_token=" + oauth.access_token
		}
	}
	
	initGroups();
}

/**
* Verifies groups images are working
* and initializes groups autocomplete
*/
function initGroups(){
	// Create autocomplete textbox
	var autocomplete = document.createElement("textbox");
	autocomplete.setAttribute("id","groups");
	autocomplete.setAttribute("type","autocomplete");
	autocomplete.setAttribute("autocompletesearch", "simple-autocomplete");
	autocomplete.setAttribute("showcommentcolumn", true);
	autocomplete.setAttribute("showimagecolumn", true);
	autocomplete.setAttribute("placeholder", groupsText);
	autocomplete.setAttribute("tabindex", "0");
	
	for (var i=0; i<userGroups.length; i++) {
		
		// Verify that images url are working
		$.ajax({ 
			type: "GET", 
			url: userGroups[i].icon,
			context:{index : i},
			success: function() { 
				initAutocompleteCallback(autocomplete, this.index, userGroups[this.index].icon);
			}, 
			error: function() {
				initAutocompleteCallback(autocomplete, this.index, "chrome://posttochatter/content/img/groups32.png");
			} 
		});	
	}
}

/**
* Creates groups json and appends the autocomplete to the page once all images are loaded
*/
function initAutocompleteCallback(autocomplete, groupIndex, imageUrl){
	// init groups json that will be used in the autocomplete
	autocompleteGroups[groupIndex] = {
		id		: userGroups[groupIndex].value,
		value	: userGroups[groupIndex].label,
		comment	: userGroups[groupIndex].desc,
		image	: imageUrl
	}
	
	// Append autocomplete to the panel once all images have been retrieved
	if(++imagesInitialized == userGroups.length){
		autocomplete.setAttribute("autocompletesearchparam", JSON.stringify(autocompleteGroups));
		document.getElementById("chatterGroups").appendChild(autocomplete);
		document.getElementById("groups").emptyText = groupsText;
		
		
		$("#groups").focus(function(){
			//Display groups when focus autocomplete
			simulateKeyAction($("#groups"), 'VK_DOWN');
		});
	
		loggedIn();
	}
}

/**
* Creates a link post in Salesforce
* @param title - feed title
* @param body - feed body
* @param url - feed url
* @param type - feed type
* @param parentId - feed parentId
*/
function linkPost(title, body, url, type, parentId){	
	var data = {
		"Title" : title,
		"Body" : body,
		"LinkUrl" : url,
		"Type" : "LinkPost",
		"ParentId" : parentId
	}

	var dataString = escapeSpecialChars(data);
	sobject(retrieveFeed, 'FeedItem', dataString);	
}

/**
* Method triggered when the feed item is correctly created
* @param data - json with feed id from rest api
*/
function retrieveFeed(data){
	panel.hidePopup();
	notify(successTitle, null, successMessage);
}

function showPost(){
	if(document.getElementById("notificationLink").disabled == false){
		var mainWindow = wm.getMostRecentWindow("navigator:browser");
		mainWindow.gBrowser.selectedTab = gBrowser.addTab(oauth.instance_url + '/' + selectedGroup.value);
	}
}

/**
* Displays a xul panel as a notification
* @param title - notification title
* @param description - notification description
*/
function notify(title, description, linkText){
	var notification = document.getElementById("notification");
	
	document.getElementById("notificationTitle").value = title != null ? title : '';
	document.getElementById("notificationContent").value = description != null ? description : '';
	document.getElementById("notificationLink").value = linkText != null ? linkText : '';
	
	document.getElementById("notificationLink").disabled = linkText == null ? true : false;
	
	notification.openPopup(button, "after_start");
	setTimeout("document.getElementById('notification').hidePopup()",7000)
}

/**
* Handles Logout functionality
*/
function logout(){
	panel.hidePopup();

	wm.addListener(windowListener);
	oauth.authorize_win = window.open(
		oauth.instance_url + "/secur/logout.jsp?display=popup&startURL=" + escape(generateAuthorizationUrl()),
		"Authorize",
		"width=800,height=600,centerscreen,location=yes"
	);
	
	oauth.access_token 	= null;
	oauth.id_url		= null;
	authorized 			= false;
	logIn 				= false;
	user 				= null;
	userGroups 			= null;
	autocompleteGroups 	= new Array();
	imagesInitialized 	= 0;
	document.getElementById("groups").parentNode.removeChild(document.getElementById("groups"));
}

/**
* Escape special chars of a json to be posted as a string 
*/
function escapeSpecialChars(jsonObject){
	var jsonString = JSON.stringify(jsonObject);		
	return jsonString.replace(/\\n/g, "\\n")
					 .replace(/\\'/g, "\\'")
					 .replace(/\\"/g, "\\\"")
					 .replace(/\\&/g, "\\&")
					 .replace(/\\r/g, "\\r")
					 .replace(/\\t/g, "\\t")
					 .replace(/\\b/g, "\\b")
					 .replace(/\\f/g, "\\f");
}

///////////////////////////////////////////////////////////////////////////////
// Post to chatter popup
///////////////////////////////////////////////////////////////////////////////

// Metadata
var metaTitle = null, metaDesc = null, metaUrl = null, metaImg = null;

function popup(){
	showLoader();
	initPopup();
	hideLoader();
	$("#postTextArea").focus();
}

function initPopup(){
	if(clearData == true){
		document.getElementById("groups").value = "";
		document.getElementById("postTextArea").value = "";
		removeErrors();
	}else{
		clearData = true;
	}
	
	initMetadata();
	
	$("#username").text(user.getElementsByTagName('display_name')[0].childNodes[0].nodeValue);
	
	$("#postTextArea").blur(function(){
		if($("#postTextArea").val() != ''){
			removeError("postTextArea");
		}
	});
}

function initMetadata(){
	document.getElementById("imageFrame").contentWindow.showImage();

	retrieveMetadata();
	
	var content = '';
	if(metaTitle != null) content =  metaTitle + " - ";
	if(metaDesc != null) content += metaDesc;
	content = content.length > metaLength ? content.substring(0, metaLength) + '...' : content;
	$("#metaText").empty();
	$("#metaText").text(content);

}

function showLoader(){
	document.getElementById("chatter-box").style.display='none';
	document.getElementById("metaContent").style.display='none';
	document.getElementById("footer").style.display='none';
	document.getElementById("loader").style.display='block';
}

function hideLoader(){
	document.getElementById("loader").style.display='none';
	document.getElementById("chatter-box").style.display='block';
	document.getElementById("metaContent").style.display='block';
	document.getElementById("footer").style.display='block';
}

function createLinkPost(){
	removeErrors();
	clearData = false;
	selectedGroup = getSelectedGroup();
	
	if(metaTitle == null && metaDesc == null && $("#postTextArea").val() == ''){
		addError("postTextArea", emptyPostMessage);
	}
	else if(selectedGroup == null){
		addError("groups", emptyGroupMessage);
	}
	else{
		var body 	= $("#postTextArea").val().trim() + ' \n \n ';
		var title 	= metaTitle != null ? metaTitle : '';
		var desc 	= metaDesc 	!= null ? metaDesc 	: '';
		var meta 	= (title != '' && desc != '') ? (title + ' - ' + desc) : (title + desc);

		meta = meta.length > metaLength ? meta.substring(0, metaLength) + '...' : meta;
		body += meta; 
		
		if(body.length >= 1000){
			body = body.substring(0,999);
		}
		
		showLoader();
		linkPost(title, body, metaUrl, 'Linkpost', selectedGroup.value);
	}
}

/**
* Gets selected group from autocomplete
* @return group
*/
function getSelectedGroup(){
	var group = null, autocomplete = document.getElementById("groups");
	
	if(autocomplete.value != null){
		var i=0, found = false;
		while(i<userGroups.length && !found){
			if(userGroups[i].label == autocomplete.value){
				group = userGroups[i];
				found = true;
			}
			i++;
		}
	}
	return group;
}

function addError(inputId, message){
	var error = document.createElement("hbox");
	error.id = inputId + "-error";
	error.className = "error";
	var label = document.createElement("label");
	label.id = inputId + "-errorLabel";
	error.appendChild(label);
	
	document.getElementById(inputId).parentNode.appendChild(error);
	document.getElementById(inputId + "-errorLabel").value = message;
}

function removeErrors(){
	$(".error").remove();
}

function removeError(elementId){
	$( "#" + elementId + "-error").remove();
}

/**
* Function that handles textbox max length
* maxLength doesn't work in multiline textbox
*/
function pnCountNoteChars(evt) {
	//allow non character keys (delete, backspace and and etc.)
	if ((evt.charCode == 0) && (evt.keyCode != 13))
		return true;

	if(evt.target.value.length < 1000) {
		return true;
	} else {
		return false;
	}
}

/**
* Gets metadata from current page
*/
function retrieveMetadata() {
	var i = 0, title = null, desc = null, meta = null;

	var mainWindow = wm.getMostRecentWindow("navigator:browser");
	var metatags = mainWindow.content.document.getElementsByTagName("meta");
	
	while(i < metatags.length && (title == null || desc == null)){
		meta = metatags[i];
		if(meta.name == "Title" || meta.name == "title" || meta.name == "TITLE"){
			title = meta.content;
		}
		if(meta.name == "Description" || meta.name == "DESCRIPTION" || meta.name == "description"){
			desc = meta.content;
		}
		i++;
	}
	
	metaTitle 	= title;
	metaDesc 	= desc;
	metaUrl		= mainWindow.content.document.location.href;
}

/**
* Simulates key action
* @param field
* @param key
* @param key
*/
function simulateKeyAction(field,key) { 
	   field.simulate("keydown",{keyCode:$.simulate[key]}) 
		   .simulate("keypress",{keyCode:$.simulate[key]}) 
		   .simulate("keyup",{keyCode:$.simulate[key]}); 
}; 