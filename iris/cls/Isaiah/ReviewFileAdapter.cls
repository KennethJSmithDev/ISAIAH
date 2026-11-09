Include %occStatus

/// Local synthetic integration only. The external consumer owns its own receipt.
Class Isaiah.ReviewFileAdapter Extends Ens.OutboundAdapter
{
Method WriteNotice(run As %String) As %Status
{
    If '##class(Isaiah.State).RunId(run) { Return $$$ERROR($$$GeneralError,"Invalid synthetic run ID.") }
    Set path="/tmp/isaiah-review-outbox/"_run_".json"
    Set notice={"schema":"isaiah-review-notice.v1","runId":(run),"incident":"R29","status":"review-requested","verified":false,"approval":false}
    Set body=notice.%ToJSON(), status=$$$OK
    Lock +^IsaiahReviewOutbox(run):2 Else  Return $$$ERROR($$$GeneralError,"Outbox busy.")
    Try {
        If ##class(%File).Exists(path) {
            Open path:"R":1 Else  Throw ##class(%Exception.General).%New("Cannot read outbox notice.")
            Use path Read existing Close path
            If existing'=body { Throw ##class(%Exception.General).%New("Outbox conflict.") }
        } Else {
            // Publish a completed notice only; a consumer must not read a partial write.
            Set temporary=path_"."_$Job_".tmp"
            Open temporary:"NWS":1 Else  Throw ##class(%Exception.General).%New("Cannot open outbox notice.")
            Use temporary Write body,! Close temporary
            If '##class(%File).Rename(temporary,path,.renameError) { Throw ##class(%Exception.General).%New("Cannot publish outbox notice.") }
        }
    } Catch ex { Set status=$$$ERROR($$$GeneralError,"Review outbox write failed.") }
    Lock -^IsaiahReviewOutbox(run)
    Return status
}
}
