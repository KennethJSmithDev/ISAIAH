Include %occStatus

Class Isaiah.Fixture
{
ClassMethod Seed() As %Status
{
    Set status = ##class(Ens.Director).CreateBusinessService("Intake",.service)
    Quit:$$$ISERR(status) status
    For index = 1:1:2 {
        Set input = ##class(Isaiah.Request).%New()
        Set input.Incident = $Select(index=1:"R17",1:"R29"), input.Action="fixture"
        Set input.Priority = "P1", input.Requested="Express"
        Set input.Predicate = $Select(index=1:"PRIORITY",1:"P1"), input.ExpressAvailable=(index=1)
        Set status = service.ProcessInput(input,.output)
        Quit:$$$ISERR(status)
    }
    Return status
}
}
