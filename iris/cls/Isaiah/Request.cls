Class Isaiah.Request Extends Ens.Request
{
Property Incident As %String(MAXLEN = 3);
Property Action As %String(MAXLEN = 16);
Property RunId As %String(MAXLEN = 36);
Property Priority As %String(MAXLEN = 16);
Property Requested As %String(MAXLEN = 16);
Property Predicate As %String(MAXLEN = 16);
Property ExpressAvailable As %Boolean;
Property Payload As %String(MAXLEN = 12000);
}
