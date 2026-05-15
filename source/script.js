// References to field elements
var fromNumber = document.getElementById('fromNumber');
var toNumber = document.getElementById('toNumber');
var dialBtn = document.getElementById('dial');
var exotelResultsValue = document.getElementById('exotelResultsValue');
var txt1 = document.getElementById('txt1');
var txt2 = document.getElementById('txt2');
var txt3 = document.getElementById('txt3');


// References to values stored in the plug-in parameters
var apikey = getPluginParameter('apikey');
var apitoken = getPluginParameter('apitoken');
var accountSid = getPluginParameter('accountSid');
var pfromNumber = getPluginParameter('fromNumber');
var ptoNumber = getPluginParameter('toNumber');
var calledID = getPluginParameter('calledID');
var recording = getPluginParameter('recording');
var displaynumber = getPluginParameter('displaynumber');
var type = getPluginParameter('type');
var jsonresponse = getPluginParameter('jsonresponse');
var smsheader = getPluginParameter('smsheader');
var msgBody = getPluginParameter('msgBody');


// First, show the current values form the fieldParams object
if (type) {
    if (type === "sms") {
        txt1.innerText = "Please check before sending SMS:";
        txt2.style.visibility = 'hidden';
        dialBtn.innerText = 'SMS';
        txt3.innerText = "This will send SMS to the respondent.";
    } else {
        fromNumber.innerHTML = pfromNumber;
    }

} else {
    fromNumber.innerHTML = pfromNumber;
}

toNumber.innerHTML = ptoNumber;
if (displaynumber === 0){
	toNumber.innerHTML = '**********';
}




// Define the dial function
dialBtn.onclick = function () {
    setButtonInProgress();
    getSite();
}

function isSmsMode() {
    return type === "sms";
}

function getDefaultButtonLabel() {
    return isSmsMode() ? 'SMS' : 'Dial';
}

function getInProgressButtonLabel() {
    return isSmsMode() ? 'Sending...' : 'Dialing...';
}

function getCompletedButtonLabel() {
    return isSmsMode() ? 'Sent' : 'Dialed';
}

function setButtonInProgress() {
    dialBtn.disabled = true;
    dialBtn.textContent = getInProgressButtonLabel();
    dialBtn.style.backgroundColor = '#d3d3d3';
    dialBtn.style.cursor = 'not-allowed';
}

function setButtonComplete() {
    dialBtn.disabled = true;
    dialBtn.textContent = getCompletedButtonLabel();
    dialBtn.style.backgroundColor = '#d3d3d3';
    dialBtn.style.cursor = 'not-allowed';
}

function resetButton() {
    dialBtn.disabled = false;
    dialBtn.textContent = getDefaultButtonLabel();
    dialBtn.style.backgroundColor = '';
    dialBtn.style.cursor = '';
}

function isJsonResponseEnabled(value) {
    if (value === null || typeof value === 'undefined' || value === '') {
        return true;
    }

    if (typeof value === 'string') {
        value = value.trim().toLowerCase();
        return value !== 'false' && value !== '0';
    }

    return value !== false && value !== 0;
}

function makeHttpObject() {
    try { return new XMLHttpRequest(); }
    catch (error) { }
    try { return new ActiveXObject("Msxml2.XMLHTTP"); }
    catch (error) { }
    try { return new ActiveXObject("Microsoft.XMLHTTP"); }
    catch (error) { }

    throw new Error("Could not create HTTP request object.");
}

function isBlank(value) {
    return value === null || typeof value === 'undefined' || String(value).trim() === '';
}

function getStoredResponseEnvelope() {
    var currentAnswer = fieldProperties.CURRENT_ANSWER;
    var emptyEnvelope = { plugin_response: [] };

    if (isBlank(currentAnswer)) {
        return emptyEnvelope;
    }

    try {
        var parsedAnswer = JSON.parse(currentAnswer);
        if (parsedAnswer && Array.isArray(parsedAnswer.plugin_response)) {
            return parsedAnswer;
        }
    } catch (error) {
    }

    return emptyEnvelope;
}

function saveJsonResponseEntry(entry) {
    var envelope = getStoredResponseEnvelope();
    envelope.plugin_response.push(entry);

    var compactResponse = JSON.stringify(envelope);
    var prettyResponse = JSON.stringify(envelope, null, 2);

    exotelResultsValue.value = prettyResponse;
    setAnswer(compactResponse);
}

function saveRawResponse(value) {
    exotelResultsValue.value = value;
    setAnswer(value);
}

function buildJsonResponseEntry(rawResponse, requestType, request) {
    var trimmedResponse = isBlank(rawResponse) ? '' : String(rawResponse).trim();
    var entry = {
        request_type: requestType,
        http_status: request.status || null,
        request_outcome: 'accepted',
        response_body: null
    };

    if (!trimmedResponse) {
        entry.request_outcome = 'empty_response';
        entry.message = 'Exotel returned an empty response body.';
        return entry;
    }

    try {
        entry.response_body = JSON.parse(trimmedResponse);
    } catch (error) {
        entry.request_outcome = 'invalid_json';
        entry.message = 'Exotel returned a response that could not be parsed as JSON.';
        entry.raw_response = rawResponse;
        return entry;
    }

    if (requestType === 'call' && entry.response_body.Call) {
        return entry;
    }

    if (requestType === 'sms' && entry.response_body.SMSMessage) {
        return entry;
    }

    entry.request_outcome = 'unexpected_response';
    entry.message = 'Exotel returned JSON that did not match the documented response format.';
    entry.raw_response = rawResponse;
    return entry;
}

function saveFailure(message, useJsonResponse, requestType, request, rawResponse, requestOutcome) {
    if (useJsonResponse) {
        saveJsonResponseEntry({
            request_type: requestType,
            http_status: request ? (request.status || null) : null,
            request_outcome: requestOutcome || 'failure',
            message: message,
            response_body: null,
            raw_response: rawResponse || null
        });
    } else {
        saveRawResponse(message);
    }

    resetButton();
}

function getSite() {
    var request = makeHttpObject();
    var sresponse;
    var useJsonResponse = isJsonResponseEnabled(jsonresponse);
    var requestType = isSmsMode() ? 'sms' : 'call';
    var hasHandledResponse = false;


    request.onreadystatechange = function () {
        if (request.readyState === 4) {
            if (hasHandledResponse) {
                return;
            }

            hasHandledResponse = true;
            sresponse = request.responseText;

            if (!useJsonResponse) {
                if (isBlank(sresponse)) {
                    saveFailure('Exotel returned an empty response body.', false, requestType, request, sresponse);
                    return;
                }

                saveRawResponse(sresponse);
                setButtonComplete();
                return;
            }

            var responseEntry = buildJsonResponseEntry(sresponse, requestType, request);
            saveJsonResponseEntry(responseEntry);

            if (responseEntry.request_outcome === 'accepted') {
                setButtonComplete();
            } else {
                resetButton();
            }
        }
    };

    request.onerror = function () {
        if (hasHandledResponse) {
            return;
        }

        hasHandledResponse = true;
        saveFailure('Request failed due to a network error.', useJsonResponse, requestType, request, request.responseText, 'network_error');
    };
    
    var urlstring = "https://" + apikey + ":" + apitoken + "@api.exotel.in/v1/Accounts/" + accountSid + "/Calls/connect";
    if (useJsonResponse) {
        urlstring += ".json";
    }
    var params = "";
    if (recording === 0) {
        params = "From=0" + pfromNumber + "&To=0" + ptoNumber + "&CallerId=0" + calledID + "&Record=false";
	} else {
        params = "From=0" + pfromNumber + "&To=0" + ptoNumber + "&CallerId=0" + calledID + "&Record=true";
    }
    if (type) {
        if (type === "sms") {
            if (isBlank(smsheader)) {
                saveFailure('SMS header is required when type=\"sms\".', useJsonResponse, 'sms', null, null, 'validation_error');
                return;
            }

            urlstring = "https://" + apikey + ":" + apitoken + "@api.exotel.in/v1/Accounts/" + accountSid + "/Sms/send"
            if (useJsonResponse) {
                urlstring += ".json";
            }
            params = "From=" + smsheader + "&To=0" + ptoNumber + "&Body=" + msgBody;
        }
    }
    request.open('POST', urlstring, true);
    request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    request.withCredentials = true;
    request.send(params);

}
