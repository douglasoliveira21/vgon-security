// MSI immediate custom action (JScript). Asks the API whether the provisioning token is usable
// (POST /agents/provisioning-tokens/validate — read-only, does not consume the token) and publishes
// TOKEN_VALID ("1"/"0") and TOKEN_MSG for ConfigDlg. Runs in msiexec's script host, so it needs
// neither .NET nor a native DLL. Non-ASCII text is written as \u escapes on purpose.

function ValidateToken() {
    function done(ok, msg) {
        Session.Property("TOKEN_VALID") = ok ? "1" : "0";
        Session.Property("TOKEN_MSG") = msg;
        return 1; // never abort the wizard; ConfigDlg gates "Next" on TOKEN_VALID
    }
    function trim(s) { return String(s || "").replace(/^\s+|\s+$/g, ""); }

    var apiUrl = trim(Session.Property("APIURL")).replace(/\/+$/, "");
    var token = trim(Session.Property("TOKEN"));
    Session.Property("APIURL") = apiUrl;
    Session.Property("TOKEN") = token;

    if (apiUrl.length == 0) return done(false, "Informe a URL da API.");
    if (!/^https?:\/\//i.test(apiUrl)) return done(false, "A URL da API deve começar com https://");
    if (token.length < 10) return done(false, "Informe o token de provisionamento.");

    try {
        var http = new ActiveXObject("WinHttp.WinHttpRequest.5.1");
        http.SetTimeouts(10000, 10000, 15000, 15000);
        http.Open("POST", apiUrl + "/agents/provisioning-tokens/validate", false);
        http.SetRequestHeader("Content-Type", "application/json");
        http.Send('{"provisioningToken":"' + token.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"}');

        var status = http.Status, text = String(http.ResponseText);
        if (status == 404) return done(false, "A API não tem o endpoint de validação. Atualize a API (deploy) e tente de novo.");
        if (status == 429) return done(false, "Muitas tentativas. Aguarde 1 minuto e tente de novo.");
        if (status < 200 || status >= 300) return done(false, "A API respondeu com erro " + status + ".");

        if (/"valid"\s*:\s*true/.test(text)) return done(true, "Token válido. Clique em Avançar.");
        var m = /"reason"\s*:\s*"([A-Z_]+)"/.exec(text);
        var reason = m ? m[1] : "";
        if (reason == "ALREADY_USED") return done(false, "Este token já foi usado. Gere um novo no dashboard.");
        if (reason == "EXPIRED") return done(false, "Este token expirou. Gere um novo no dashboard.");
        return done(false, "Token inválido. Confira se copiou o token completo.");
    } catch (e) {
        return done(false, "Não foi possível conectar à API: " + (e.message || e));
    }
}
