Include %occStatus

Class DevTrace.Intake Extends Ens.BusinessService
{
Method OnProcessInput(input As %RegisteredObject, Output output As %RegisteredObject) As %Status
{
    Return ..SendRequestSync("Fixture Sink",input,.output,10)
}
}
