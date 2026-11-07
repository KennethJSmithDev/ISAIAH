Include %occStatus

Class Isaiah.Intake Extends Ens.BusinessService
{
Method OnProcessInput(input As %RegisteredObject, Output output As %RegisteredObject) As %Status
{
    If (input.Action = "fixture") || (input.Action = "replay") || (input.Action = "change-check") {
        Return ..SendRequestSync("Router",input,.output,15)
    }
    If input.Action = "investigate" {
        Return ..SendRequestSync("Investigation",input,.output,300)
    }
    Return $$$ERROR($$$GeneralError,"Unsupported intake action.")
}
}
