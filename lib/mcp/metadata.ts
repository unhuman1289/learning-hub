/** Static discovery for the configured OAuth provider: no auth API self-dispatch or user state. */
export const mcpScopes=['openid','offline_access','hub:plan','hub:assess'];
export function authorizationMetadata(origin:string){
 const issuer=origin+'/api/auth';
 return {issuer,authorization_endpoint:issuer+'/oauth2/authorize',token_endpoint:issuer+'/oauth2/token',registration_endpoint:issuer+'/oauth2/register',jwks_uri:issuer+'/jwks',userinfo_endpoint:issuer+'/oauth2/userinfo',revocation_endpoint:issuer+'/oauth2/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],scopes_supported:mcpScopes,token_endpoint_auth_methods_supported:['none','client_secret_post','client_secret_basic'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true,subject_types_supported:['public'],id_token_signing_alg_values_supported:['EdDSA']};
}
